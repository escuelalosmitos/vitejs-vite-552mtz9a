import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parse } from 'espree';
import { transformWithOxc } from 'vite';
import * as runtime from 'react/jsx-runtime';

const source = await readFile('src/components/ResponsiveAdminDetail.jsx', 'utf8');
const compiled = (await transformWithOxc(source, 'ResponsiveAdminDetail.jsx')).code;
const ast = parse(compiled, { ecmaVersion: 'latest', sourceType: 'module', range: true });

// Exercise the real component's layout effects and portal lifecycle without
// connecting the admin portal to Firestore or sending notifications.
function mount({ width = 1480, open = false, breakpoint = 900 } = {}) {
  const slots = [], effects = [], listeners = new Map(), windowListeners = new Map(), scrolls = [];
  const container = { clientWidth: width };
  let index = 0, dirty = false, tree, observer, closeCount = 0, editCount = 0;
  const originalBody = { position: '', top: '', left: '', width: '', overflow: 'auto' };
  const trigger = { isConnected: true, focus() { document.activeElement = trigger; } };
  const document = { body: { style: { ...originalBody } }, documentElement: { style: { scrollbarGutter: '' } }, activeElement: trigger,
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  const window = { scrollX: 0, scrollY: 680, getComputedStyle: () => ({ paddingLeft: '20px', paddingRight: '20px' }),
    addEventListener: (name, callback) => windowListeners.set(name, callback), removeEventListener: name => windowListeners.delete(name), scrollTo: options => scrolls.push(options) };
  const hooks = {
    useState(initial) { const at = index++; if (!(at in slots)) slots[at] = initial; return [slots[at], value => { const next = typeof value === 'function' ? value(slots[at]) : value; if (!Object.is(next, slots[at])) { slots[at] = next; dirty = true; } }]; },
    useRef(initial) { const at = index++; return slots[at] ||= { current: initial }; },
    useId() { index++; return 'detail-title'; },
    useLayoutEffect(callback, deps) { const at = index++; const previous = slots[at]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      slots[at] = { deps, cleanup: null }; effects.push(() => { previous?.cleanup?.(); slots[at].cleanup = callback(); });
    } }
  };
  const context = { window, document, ResizeObserver: class { constructor(callback) { observer = callback; } observe(value) { assert.equal(value, container); } disconnect() { observer = null; } } };
  const deps = { react: hooks, 'react/jsx-runtime': runtime, 'react-dom': { createPortal: (children, target) => ({ type: 'portal', props: { children }, target }) } };
  let code = '', end = 0;
  for (const node of ast.body) if (node.type === 'ImportDeclaration') {
    code += compiled.slice(end, node.range[0]);
    for (const item of node.specifiers) context[item.local.name] = deps[node.source.value][item.imported.name];
    end = node.range[1];
  } else if (node.type === 'ExportDefaultDeclaration') { code += compiled.slice(end, node.range[0]); end = node.declaration.range[0]; }
  code += compiled.slice(end) + '\nglobalThis.Detail = ResponsiveAdminDetail;'; vm.runInNewContext(code, context);
  const nodes = () => { const result = []; const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (node && typeof node === 'object' && node.props) { result.push(node); walk(node.props.children); } }; walk(tree); return result; };
  const closeButton = { getClientRects: () => [1], closest: () => null, focus() { document.activeElement = closeButton; } };
  const lastButton = { getClientRects: () => [1], closest: () => null, focus() { document.activeElement = lastButton; } };
  const dialog = { contains: target => [closeButton, lastButton].includes(target), querySelectorAll: () => [closeButton, lastButton] };
  const props = { open, breakpoint, title: 'Detalle del trámite', section: 'gestiones', desktopClassName: 'inbox-detail-container',
    onClose: () => { closeCount++; props.open = false; }, children: runtime.jsx('p', { children: 'Solicitud completa' }) };
  const render = () => {
    let safety = 0;
    do {
      assert.ok(++safety < 8, 'El cambio de ancho no debe provocar un bucle de diseño');
      dirty = false; index = 0; tree = context.Detail(props);
      for (const node of nodes()) if (node.props.ref) node.props.ref.current = node.props.role === 'dialog' ? dialog : node.type === 'button' ? closeButton : { closest: () => container };
      effects.splice(0).forEach(callback => callback());
    } while (dirty);
  };
  render();
  return { props, nodes, render, document, scrolls, trigger, closeButton, lastButton, originalBody, closeCount: () => closeCount,
    open: () => { props.open = true; render(); }, resize: width => { container.clientWidth = width; observer?.(); render(); },
    key: (key, shiftKey = false, target = document.activeElement) => { const event = { key, shiftKey, target, prevented: false, preventDefault() { this.prevented = true; } }; listeners.get('keydown')?.(event); return event; },
    edit: () => { editCount++; nodes().find(node => node.props.className?.includes('admin-responsive-dialog-content')).props.onClick({ target: { closest: () => ({}) } }); render(); }, editCount: () => editCount,
    unmount: () => slots.forEach(slot => slot?.cleanup?.()) };
}

test('en ordenador el detalle queda en su panel; en móvil sólo se abre tras seleccionar', () => {
  const desktop = mount({ open: true });
  assert.equal(desktop.nodes().some(node => node.type === 'portal'), false);
  assert.equal(desktop.nodes().find(node => node.props.role === 'region').props.hidden, false);
  assert.equal(desktop.document.body.style.position, '');
  const phone = mount({ width: 390 });
  assert.equal(phone.nodes().some(node => node.props.role === 'dialog'), false);
  phone.open();
  assert.equal(phone.nodes().find(node => node.type === 'portal').target, phone.document.body);
  assert.equal(phone.nodes().find(node => node.props.role === 'dialog').props['aria-modal'], 'true');
  assert.equal(phone.nodes().find(node => node.props.role === 'region').props.hidden, true);
  assert.equal(phone.document.body.style.position, 'fixed');
  assert.equal(phone.document.body.style.top, '-680px');
  phone.unmount(); desktop.unmount();
});

test('cerrar o pulsar Escape devuelve foco y posición del listado y libera su desplazamiento', () => {
  for (const escape of [false, true]) {
    const phone = mount({ width: 390, open: true });
    assert.equal(phone.document.activeElement, phone.closeButton);
    if (escape) assert.equal(phone.key('Escape').prevented, true);
    else phone.nodes().find(node => node.type === 'button').props.onClick();
    phone.render();
    assert.equal(phone.closeCount(), 1);
    assert.equal(phone.nodes().some(node => node.type === 'portal'), false);
    assert.deepEqual(phone.document.body.style, phone.originalBody);
    assert.equal(phone.document.activeElement, phone.trigger);
    assert.equal(phone.scrolls.at(-1).top, 680);
    phone.unmount();
  }
});

test('el diálogo mantiene el teclado dentro y permite editar una publicación sin tapar el editor', () => {
  const phone = mount({ width: 390, open: true });
  assert.equal(phone.key('Tab', true).prevented, true); assert.equal(phone.document.activeElement, phone.lastButton);
  assert.equal(phone.key('Tab').prevented, true); assert.equal(phone.document.activeElement, phone.closeButton);
  assert.equal(phone.key('Escape', false, {}).prevented, false);
  phone.edit(); assert.equal(phone.editCount(), 1); assert.equal(phone.closeCount(), 1);
  assert.equal(phone.nodes().some(node => node.type === 'portal'), false);
  phone.unmount();
});

test('al cambiar el ancho la selección pasa de panel a ventana y vuelve sin dejar bloqueada la página', () => {
  const app = mount({ width: 1500, open: true, breakpoint: 1100 });
  app.resize(900); assert.equal(app.nodes().some(node => node.type === 'portal'), true);
  app.resize(1500); assert.equal(app.nodes().some(node => node.type === 'portal'), false);
  assert.equal(app.props.open, true); assert.deepEqual(app.document.body.style, app.originalBody);
  app.unmount();
});
