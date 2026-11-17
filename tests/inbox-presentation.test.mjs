import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import { transformWithOxc } from 'vite';
import * as jsxRuntime from 'react/jsx-runtime';
const source = await readFile('src/components/AdminPortal.jsx', 'utf8');
const start = source.indexOf('  const selectInboxGestion = async gestion => {');
const end = source.indexOf('\n  };', start) + 5;
function setup(getDoc) {
  const state = {};
  const context = { inboxDetailRequestRef: { current: 0 }, setInboxSelectedId: id => state.id = id, setInboxPrivateDetail: value => state.detail = value, getDoc, doc: (...args) => args, db: {}, appId: 'demo' };
  return { state, select: vm.runInNewContext(source.slice(start, end) + '\nselectInboxGestion;', context) };
}
test('seleccionar una solicitud pública no realiza lecturas privadas', async () => {
  const {state, select} = setup(() => { throw Error('lectura inesperada'); });
  await select({id:'publica'});
  assert.equal(state.id,'publica'); assert.equal(state.detail.loading,false);
});
test('una respuesta privada tardía no sustituye la selección más reciente', async () => {
  const pending = {};
  const {state, select} = setup(path => new Promise(resolve => pending[path.at(-1)] = resolve));
  const first = select({id:'A',hasPrivateDetails:true});
  const second = select({id:'B',hasPrivateDetails:true});
  pending.B({exists:()=>true,data:()=>({details:'Notas B'})}); await second;
  pending.A({exists:()=>true,data:()=>({details:'Notas A'})}); await first;
  assert.equal(state.id,'B'); assert.equal(state.detail.details,'Notas B');
});
test('un error al cargar notas permite reintentar la misma selección', async () => {
  let calls = 0;
  const {state, select} = setup(async () => { if (++calls === 1) throw Error('sin conexión'); return {exists:()=>true,data:()=>({details:'Recuperadas'})}; });
  const g = {id:'A',hasPrivateDetails:true};
  await select(g); assert.equal(state.detail.error,true);
  await select(g); assert.equal(state.detail.details,'Recuperadas'); assert.equal(state.detail.error,undefined);
});

async function personalView(name, props, services) {
  const source = await readFile(`src/components/${name}.jsx`, 'utf8');
  const compiled = (await transformWithOxc(source, `${name}.jsx`)).code;
  const ast = parse(compiled, { ecmaVersion: 'latest', sourceType: 'module', range: true });
  const slots = [], effects = [];
  let index = 0, tree;
  const hooks = {
    useState(initial) {
      const at = index++;
      if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
      return [slots[at], value => { slots[at] = typeof value === 'function' ? value(slots[at]) : value; }];
    },
    useEffect(callback, deps) {
      const at = index++;
      if (!slots[at] || deps.some((value, i) => value !== slots[at][i])) { slots[at] = deps; effects.push(callback); }
    }
  };
  const modules = { react: hooks, 'react/jsx-runtime': jsxRuntime,
    'lucide-react': { Mail: 'mail-icon', X: 'close-icon' }, ...services };
  const context = { crypto: { randomUUID: () => 'fixed-message-id' } };
  let code = '', end = 0;
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      code += compiled.slice(end, node.range[0]);
      for (const specifier of node.specifiers) context[specifier.local.name] = modules[node.source.value][specifier.imported.name];
      end = node.range[1];
    } else if (node.type === 'ExportDefaultDeclaration') {
      code += compiled.slice(end, node.range[0]); end = node.declaration.range[0];
    }
  }
  code += compiled.slice(end) + `\nglobalThis.View = ${name};`;
  vm.runInNewContext(code, context);
  const render = () => { index = 0; tree = context.View(props); effects.splice(0).forEach(callback => callback()); };
  const nodes = () => {
    const result = [];
    const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (node?.props) { result.push(node); walk(node.props.children); } };
    walk(tree); return result;
  };
  render(); return { render, nodes, props };
}

test('la bandeja personal carga por ID y permite leer y marcar sin formulario de respuesta', async () => {
  let emit, path;
  const writes = [];
  const view = await personalView('StudentInbox', { db: {}, appId: 'app', studentId: 'student-id', open: true, onToggle() {}, onClose() {} }, {
    'firebase/firestore': {
      collection: (_db, ...parts) => parts.join('/'), doc: (_db, ...parts) => parts.join('/'),
      onSnapshot: (ref, callback) => { path = ref; emit = callback; return () => {}; },
      serverTimestamp: () => 'server-time', updateDoc: async (ref, data) => writes.push([ref, data])
    }
  });
  assert.equal(path, 'artifacts/app/students/student-id/inboxMessages');
  emit({ docs: [{ id: 'message', data: () => ({ title: 'Aviso', body: 'Mensaje completo', readAt: null }) }] });
  view.render();
  assert.ok(view.nodes().some(node => node.type === 'p' && node.props.children === 'Mensaje completo'));
  assert.equal(view.nodes().filter(node => ['form', 'textarea', 'input'].includes(node.type)).length, 0);
  await view.nodes().find(node => node.type === 'button' && node.props.children === 'Marcar como leído').props.onClick();
  assert.equal(writes[0][0], 'artifacts/app/students/student-id/inboxMessages/message');
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0][1])), { readAt: 'server-time' });
});

test('el envío personal conserva destinatarios e identidad del mensaje al reintentar y evita doble envío', async () => {
  const calls = [];
  const view = await personalView('PersonalMessageComposer', { db: {}, appId: 'app', user: { email: 'admin@example.com' }, recipients: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], onClose() {} }, {
    './personalMessagesStore.js': { sendPersonalMessages: async args => { calls.push(args); if (calls.length === 1) throw Error('fallo parcial'); } }
  });
  view.nodes().find(node => node.type === 'input').props.onChange({ target: { value: 'Asunto' } });
  view.nodes().find(node => node.type === 'textarea').props.onChange({ target: { value: 'Mensaje breve' } });
  view.render();
  await view.nodes().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  view.render();
  assert.equal(view.nodes().find(node => node.type === 'textarea').props.disabled, true);
  await view.nodes().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  view.render();
  await view.nodes().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].messageId, calls[1].messageId);
  assert.deepEqual([...calls[1].studentIds], ['a', 'b']);
  assert.ok(view.nodes().some(node => node.props.role === 'status' && node.props.children === 'Mensaje entregado.'));
});
