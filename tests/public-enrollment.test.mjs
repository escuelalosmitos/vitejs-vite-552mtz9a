import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parse } from 'espree';
import { transformWithOxc } from 'vite';
import * as runtime from 'react/jsx-runtime';
import { getPublicEnrollmentClasses, filterPublicEnrollmentClasses, getPublicFormStartDate } from '../src/components/publicEnrollmentUtils.js';
import * as helpers from '../src/components/publicEnrollmentUtils.js';

const base = { selectionId: 'guitar-a', escuela: 'Reus', instrumento: 'Guitarra', horario: 'Lunes a las 18:00h', dayNum: 1, timeStr: '18:00', maxCap: 4, plazas: 2, url: 'https://example.com/inscripcion', precio: '70 €/mes' };
const fixedTime = Date.parse('2026-10-27T12:00:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [fixedTime])); } static now() { return fixedTime; } }
const html = await readFile('FORMULARIO_PUBLICO_WORDPRESS.html', 'utf8');
const formSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const ast = parse(formSource, { ecmaVersion: 'latest', sourceType: 'module', range: true });
const functions = ['parseLocalDate', 'formatLocalDate', 'getTodayString', 'getEffectiveStartDate', 'subscribeToPublicAvailability'];
const actualForm = payload => {
  const context = { Date: Clock, datos: [], db: {}, doc: () => ({}), initUIFromData() {}, setStatus() {}, console,
    onSnapshot: (_ref, handler) => handler({ exists: () => true, data: () => payload }) };
  vm.createContext(context);
  for (const name of functions) { const node = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name); vm.runInContext(formSource.slice(...node.range), context); }
  context.subscribeToPublicAvailability(); return JSON.parse(JSON.stringify(context.datos));
};

test('el listado coincide campo por campo con el formulario real para plazas, reservas, formación y datos inválidos', () => {
  const payload = { classes: [
    base,
    { ...base, selectionId: 'full', plazas: 0 },
    { ...base, selectionId: 'negative', plazas: -1 },
    { ...base, selectionId: 'reserved-full', maxCap: 8, plazas: 0, activeCount: 2 },
    { ...base, selectionId: 'formation', inicio: '2026-10-01', autoAdvanceStartDate: true, allowPrivateOpening: true, privateOpeningUrl: 'https://example.com/private' },
    { ...base, selectionId: 'future', inicio: '2027-01-04' },
    { ...base, selectionId: 'same-time-other-group', plazas: 1 },
    { ...base, selectionId: '', escuela: ' Reus ', maxCap: '4', plazas: '3' },
    ...[{ escuela: '' }, { instrumento: '' }, { horario: '' }, { dayNum: -1 }, { dayNum: 7 }, { dayNum: 1.5 }, { dayNum: 'x' }, { maxCap: 0 }].map(patch => ({ ...base, ...patch }))
  ] };
  const actual = getPublicEnrollmentClasses(payload, '2026-10-27');
  assert.deepEqual(actual, actualForm(payload));
  assert.equal(actual.length, 5);
  assert.equal(actual.some(item => item.selectionId === 'full'), false);
  assert.equal(actual.find(item => item.selectionId === 'formation').inicio, '2026-11-02');
  assert.equal(actual.find(item => item.selectionId === 'same-time-other-group').plazas, 1);
  assert.equal(actual.at(-1).selectionId, 'legacy-7');
  assert.deepEqual(getPublicEnrollmentClasses(null), []);
});

test('fechas de inicio avanzan igual que el formulario y conservan las fechas fijas', () => {
  for (const inicio of ['2026-01-01', '2026-10-01', '2026-10-27', '2027-01-01', '', 'invalida']) {
    for (const dayNum of [0, 1, 2, 3, 4, 5, 6]) for (const autoAdvanceStartDate of [false, true]) {
      const payload = { classes: [{ ...base, inicio, dayNum, autoAdvanceStartDate }] };
      assert.deepEqual(getPublicEnrollmentClasses(payload, '2026-10-27'), actualForm(payload));
    }
  }
  assert.equal(getPublicFormStartDate('2026-10-01', 1, false, '2026-10-27'), '2026-10-01');
});

test('filtros cruzados y orden de horarios conservan grupos distintos y colocan domingo al final', () => {
  const classes = [base, { ...base, selectionId: 'second', plazas: 1 }, { ...base, selectionId: 'other-school', escuela: 'Tarragona' }, { ...base, selectionId: 'other-instrument', instrumento: 'Piano' }, { ...base, selectionId: 'sunday', dayNum: 0 }, { ...base, selectionId: 'tuesday', dayNum: 2 }];
  const filtered = filterPublicEnrollmentClasses(classes, { center: 'Reus', instrument: 'Guitarra', day: '1' });
  assert.deepEqual(filtered.map(item => item.selectionId), ['guitar-a', 'second']);
  assert.equal(filterPublicEnrollmentClasses(classes, { day: '0' }).length, 1);
  const sorted = filterPublicEnrollmentClasses(classes, { center: 'Reus', instrument: 'Guitarra' });
  assert.equal(sorted.at(-1).selectionId, 'sunday');
});

const makeView = async () => {
  const source = await readFile('src/components/PublicEnrollmentView.jsx', 'utf8');
  const compiled = (await transformWithOxc(source, 'PublicEnrollmentView.jsx')).code;
  const ast = parse(compiled, { ecmaVersion: 'latest', sourceType: 'module', range: true });
  const slots = [], effects = []; let index = 0, tree, callback, failure, subscriptions = 0, activeSubscriptions = 0;
  const visits = [];
  const hooks = {
    useState(initial) { const at = index++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], next => { slots[at] = typeof next === 'function' ? next(slots[at]) : next; }]; },
    useMemo(fn) { index++; return fn(); },
    useEffect(fn, deps) { const at = index++; if (!slots[at] || deps.some((value, i) => !Object.is(value, slots[at].deps[i]))) { slots[at]?.cleanup?.(); slots[at] = { deps }; effects.push(() => { slots[at].cleanup = fn(); }); } }
  };
  const dependencies = { react: hooks, 'react/jsx-runtime': runtime, './publicEnrollmentUtils.js': helpers,
    'firebase/firestore': { doc: (_db, ...parts) => parts.join('/'), onSnapshot: (path, options, next, error) => { assert.equal(path, 'publicData/classAvailability'); assert.ok(options.includeMetadataChanges); callback = next; failure = error; subscriptions++; activeSubscriptions++; return () => { activeSubscriptions--; }; } } };
  const context = { setInterval: () => 1, clearInterval() {} }; let code = '', end = 0;
  for (const node of ast.body) if (node.type === 'ImportDeclaration') {
    code += compiled.slice(end, node.range[0]);
    for (const specifier of node.specifiers) context[specifier.local.name] = dependencies[node.source.value][specifier.imported.name];
    end = node.range[1];
  } else if (node.type === 'ExportDefaultDeclaration') { code += compiled.slice(end, node.range[0]); end = node.declaration.range[0]; }
  code += compiled.slice(end) + '\nglobalThis.View = PublicEnrollmentView;'; vm.runInNewContext(code, context);
  const internal = { id: 'internal-guitar', teacher: 'Paco' };
  const props = { db: {}, internalClassesBySelection: new Map([[base.selectionId, internal]]), onStudents: value => visits.push(['students', value]), onConfigure: value => visits.push(['web', value]) };
  const render = () => { index = 0; tree = context.View(props); effects.splice(0).forEach(fn => fn()); };
  const nodes = () => { const result = []; const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (node && typeof node === 'object' && node.props) { result.push(node); walk(node.props.children); } }; walk(tree); return result; };
  const button = text => nodes().find(node => node.type === 'button' && node.props.children === text);
  render();
  return { nodes, button, internal, visits, render, subscriptions: () => subscriptions, activeSubscriptions: () => activeSubscriptions,
    emit: (payload, exists = true, cached = false) => { callback({ exists: () => exists, data: () => payload, metadata: { fromCache: cached } }); render(); },
    fail: () => { failure(); render(); } };
};

test('vista real lee un solo documento, conserva turnos sin enlace interno y sus acciones usan el identificador exacto', async () => {
  const view = await makeView();
  assert.equal(view.subscriptions(), 1);
  view.emit({ classes: [base, { ...base, selectionId: 'same-time-different-class' }, { ...base, selectionId: 'full', plazas: 0 }] });
  assert.equal(view.nodes().filter(node => node.type === 'article').length, 2);
  assert.equal(view.nodes().filter(node => node.type === 'button' && node.props.children === 'Alumnos').length, 1);
  view.button('Alumnos').props.onClick(); view.button('Configurar / Web').props.onClick();
  assert.equal(view.visits[0][1], view.internal); assert.equal(view.visits[1][1], view.internal);
  const school = view.nodes().find(node => node.props['aria-label'] === 'Escuela del formulario'); school.props.onChange({ target: { value: 'No existe' } }); view.render();
  assert.equal(view.nodes().filter(node => node.type === 'article').length, 0); assert.equal(view.subscriptions(), 1);
});

test('sin publicación y errores se distinguen de una lista vacía; reintentar sustituye el listener', async () => {
  const view = await makeView(); view.emit(null, false);
  assert.equal(view.nodes().filter(node => node.type === 'article').length, 0);
  view.emit({ classes: [base] }); assert.equal(view.nodes().filter(node => node.type === 'article').length, 1);
  view.fail(); assert.equal(view.nodes().filter(node => node.type === 'article').length, 0); assert.ok(view.button('Reintentar'));
  view.button('Reintentar').props.onClick(); view.render(); assert.equal(view.activeSubscriptions(), 1); assert.equal(view.subscriptions(), 2);
  view.emit({ classes: [] }); assert.equal(view.nodes().filter(node => node.type === 'article').length, 0);
});
