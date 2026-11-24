import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import { transformWithOxc } from 'vite';
import * as runtime from 'react/jsx-runtime';
import * as promotionHelpers from '../src/components/enrollmentPromotions.js';
import { createEnrollmentPromotions, enrollmentPromotions as promo, blackFriday2026Draft } from '../src/components/enrollmentPromotions.js';
import { buildPublicClassSelectionId, isPublicExpansionSeat } from '../src/components/classExpansionUtils.js';

const campaign = () => ({ ...blackFriday2026Draft(), status: 'enabled' });
const turn = { selectionId: 'public-guitar-1', escuela: 'Reus', instrumento: 'Guitarra', horario: 'Lunes a las 19:00h', dayNum: 1, timeStr: '19:00', maxCap: 4, plazas: 2, precio: '60 €/mes', url: 'https://example.com/normal', allowPrivateOpening: true, privateOpeningUrl: 'https://example.com/particular', privateOpeningPrice: '120 €/mes', privateOpeningThreshold: 2 };
const inCampaign = Date.parse('2026-11-24T12:00:00Z');
const html = await readFile('FORMULARIO_PUBLICO_WORDPRESS.html', 'utf8');
const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', range: true });

test('el HTML entregado incorpora exactamente el motor compartido, sin otra versión de las reglas comerciales', () => {
  const node = ast.body.find(item => item.type === 'FunctionDeclaration' && item.id.name === 'createEnrollmentPromotions');
  assert.equal(source.slice(...node.range), createEnrollmentPromotions.toString());
});

test('Black Friday empieza y termina a la hora de Madrid y no necesita Administración abierta', () => {
  const c = campaign();
  assert.equal(c.startsAt, Date.parse('2026-11-22T23:00:00Z'));
  assert.equal(c.endsAt, Date.parse('2026-11-29T22:59:59.999Z'));
  assert.equal(promo.state(c, c.startsAt - 1), 'Programada');
  assert.equal(promo.active([c], c.startsAt).id, c.id);
  assert.equal(promo.active([c], c.endsAt).id, c.id);
  assert.equal(promo.active([c], c.endsAt + 1), null);
  assert.equal(promo.madridInput(promo.madridMillis('2027-07-05T09:15')), '2027-07-05T09:15');
  assert.equal(promo.madridMillis('2027-03-28T02:30'), 0);
  assert.equal(promo.madridMillis('2027-02-30T09:00'), 0);
});

test('el enlace temporal no cambia los enlaces guardados y restaura también el de apertura particular', () => {
  const c = campaign(), copy = JSON.stringify(turn);
  assert.equal(promo.quote([c], turn, 'Guitarra', 'group', inCampaign).destination, c.commonUrl);
  assert.equal(promo.quote([c], turn, 'Guitarra', 'private', inCampaign).destination, turn.privateOpeningUrl);
  assert.equal(promo.quote([c], turn, 'Guitarra', 'private', c.endsAt + 1).destination, turn.privateOpeningUrl);
  assert.equal(promo.quote([{ ...c, status: 'paused' }], turn, 'Guitarra', 'group', inCampaign).destination, turn.url);
  assert.equal(JSON.stringify(turn), copy);
});

test('filtros combinados, Bajo y Ukelele compartidos, exclusión de particulares y redondeo del descuento', () => {
  const c = { ...campaign(), centers: ['Reus'], instruments: ['Bajo'], capacities: ['4'], days: ['1'] };
  const q = promo.quote([c], turn, 'Bajo', 'group', inCampaign);
  assert.equal(q.eligible, true); assert.equal(q.discountedCents, 3000); assert.match(q.durationLabel, /enero de 2027/);
  assert.equal(promo.quote([c], turn, 'Ukelele', 'group', inCampaign).eligible, false);
  assert.equal(promo.quote([c], { ...turn, escuela: 'Tarragona' }, 'Bajo', 'group', inCampaign).eligible, false);
  assert.equal(promo.quote([c], turn, 'Bajo', 'private', inCampaign).eligible, false);
  assert.equal(promo.quote([campaign()], { ...turn, maxCap: 1 }, 'Guitarra', 'group', inCampaign).eligible, false);
  assert.equal(promo.quote([{ ...c, excludedSelectionIds: [turn.selectionId] }], turn, 'Bajo', 'group', inCampaign).eligible, false);
  assert.equal(promo.quote([{ ...campaign(), discountType: 'fixed', discountValue: 100 }], turn, 'Guitarra', 'group', inCampaign).discountedCents, 0);
  assert.equal(promo.quote([campaign()], { ...turn, precio: '60,01 €/mes' }, 'Guitarra', 'group', inCampaign).discountedCents, 3001);
  assert.equal(promo.monthlyCents('Desde 40 €/mes hasta 70 €/mes'), null);
});

test('no se suman campañas y la publicación excluye borradores, enlaces peligrosos y datos internos', () => {
  const c = campaign();
  assert.equal(promo.active([c, { ...c, id: 'priority', priority: 10, discountValue: 20 }], inCampaign).id, 'priority');
  assert.equal(promo.quote([c, { ...c, id: 'priority', priority: 10, discountValue: 20 }], turn, 'Guitarra', 'group', inCampaign).discountedCents, 4800);
  assert.deepEqual(promo.publicCampaigns([{ ...c, commonUrl: 'javascript:alert(1)' }, blackFriday2026Draft()]), []);
  const published = promo.publicCampaigns([{ ...c, internalNotes: 'privado', students: [{ name: 'dato privado' }], privateEmail: 'private@example.com' }]);
  assert.equal(published.length, 1); assert.equal(JSON.stringify(published).includes('privado'), false); assert.equal(JSON.stringify(published).includes('@'), false);
  assert.equal(promo.error({ ...c, discountValue: 101 }).length > 0, true);
});

test('el resumen diferencia el descuento de enero, cobro en diciembre y permanencia de enero a marzo', () => {
  const c = campaign(), q = promo.quote([c], turn, 'Ukelele', 'group', inCampaign);
  const text = promo.summary(turn, 'Ukelele', 'group', q, inCampaign);
  assert.match(text, /Instrumento: Ukelele/); assert.match(text, /Cuota habitual.*60/);
  assert.match(text, /Cuota promocional.*30.*enero de 2027/);
  assert.match(text, /diciembre de 2026/); assert.match(text, /Febrero y marzo.*tarifa habitual/);
  assert.match(text, /Permanencia durante enero, febrero y marzo de 2027/);
  assert.doesNotMatch(text, /Resumen preparado:/); assert.match(text, /Sin cobro al inscribirse/);
  assert.ok(promo.summaryLength(text) <= 1000);
});

test('el resumen cabe en 1.000 caracteres incluidos los saltos de Windows y no corta condiciones para encajar', () => {
  const c = campaign();
  const offer = promo.quote([c], turn, 'Guitarra', 'group', inCampaign);
  const text = promo.summary(turn, 'Guitarra', 'group', offer);
  assert.equal(promo.summaryLength(text), text.replace(/\n/g, '\r\n').length);
  assert.ok(text.length < 800); assert.ok(promo.summaryLength(text) <= 1000);
  assert.match(text, /diciembre de 2026/); assert.match(text, /Permanencia durante enero, febrero y marzo de 2027\./);
  assert.match(text, /Ref\. turno: public-guitar-1/);
  const long = { ...c, summaryTerms: '', billingText: 'Calendario pendiente de revisión. '.repeat(30), commitmentText: 'Permanencia pendiente de revisión. '.repeat(30) };
  assert.equal(promo.summary(turn, 'Guitarra', 'group', promo.quote([long], turn, 'Guitarra', 'group', inCampaign)), '');
  assert.ok(promo.summary(turn, 'Guitarra', 'group', promo.quote([{ ...long, summaryTerms: 'Cobro en diciembre. Permanencia hasta marzo.' }], turn, 'Guitarra', 'group', inCampaign)).length > 0);
});

function makeForm() {
  const elements = new Map(), intervals = [], timeouts = [], storage = new Map(), copied = [];
  let snapshotHandler, now = inCampaign;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  class Element {
    constructor() { this.value = ''; this.style = {}; this.options = []; this.children = []; this.handlers = {}; this.dataset = {}; this.classList = { toggle() {} }; this.checked = false; this.disabled = false; this.textContent = ''; }
    set innerHTML(value) { this._html = value; this.children = []; this.options = []; this.value = ''; }
    get innerHTML() { return this._html; }
    appendChild(item) { this.children.push(item); this.options.push(item); }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    dispatchEvent(event) { return this.handlers[event.type]?.({ ...event, target: this }); }
    querySelectorAll() { return []; }
    focus() {} select() {}
  }
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const document = { getElementById: element, createElement: () => new Element(), addEventListener() {}, hidden: false };
  const context = { Date: Clock, Intl, URL, document, console, Event: class Event { constructor(type) { this.type = type; } },
    navigator: { clipboard: { writeText: async value => copied.push(value) } }, window: { location: { href: '' } }, alert: text => { context.lastAlert = text; },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: fn => timeouts.push(fn), setInterval: fn => intervals.push(fn), initializeApp: () => ({}), getFirestore: () => ({}), doc: (_db, ...parts) => { assert.deepEqual(parts, ['publicData', 'classAvailability']); return {}; },
    onSnapshot: (_ref, handler) => { snapshotHandler = handler; } };
  const code = ast.body.filter(node => node.type !== 'ImportDeclaration').map(node => source.slice(...node.range)).join('\n');
  vm.createContext(context); vm.runInContext(code, context);
  const emit = (campaigns = [campaign()], classes = [turn]) => { snapshotHandler({ exists: () => true, data: () => ({ classes, campaigns }) }); while (timeouts.length) timeouts.shift()(); };
  const change = (id, value) => { const el = element(id); el.value = value; el.dispatchEvent({ type: 'change' }); };
  const select = (instrument = 'Ukelele') => { change('escuela', 'Reus'); change('instrumento', instrument); change('horario', turn.selectionId); };
  return { emit, select, element, change, copied, context, tick: value => { now = value; intervals.forEach(fn => fn()); } };
}

test('el formulario real exige revisar la oferta, copia un resumen completo y dirige al enlace común sin cobrar ni reservar', async () => {
  const form = makeForm(); form.emit(); form.select();
  assert.equal(form.element('continuar').disabled, true);
  assert.match(form.element('campaign-summary').value, /Instrumento: Ukelele/);
  assert.match(form.element('campaign-summary').value, /enero de 2027/);
  assert.doesNotMatch(form.element('shared-instrument-note').textContent, /bajo/);
  assert.match(form.element('summaryBody').textContent, /enero de 2027/);
  assert.doesNotMatch(form.element('campaign-payment-note').textContent, /sin permanencia/);
  assert.match(form.element('campaign-payment-note').textContent, /enero, febrero y marzo/);
  await form.element('copy-campaign-summary').handlers.click();
  assert.equal(form.copied[0], form.element('campaign-summary').value);
  assert.ok(promo.summaryLength(form.copied[0]) <= 1000);
  assert.match(form.element('campaign-summary-count').textContent, /\/1000 caracteres/);
  form.element('campaign-accept').checked = true; form.element('campaign-accept').dispatchEvent({ type: 'change' });
  assert.equal(form.element('continuar').disabled, false);
  form.element('continuar').handlers.click(); assert.equal(form.context.window.location.href, campaign().commonUrl);
  form.change('instrumento', 'Bajo'); form.change('horario', turn.selectionId);
  assert.equal(form.element('continuar').disabled, true); assert.doesNotMatch(form.element('shared-instrument-note').textContent, /ukelele/);
});

test('un resumen excesivo bloquea copiar y continuar por la oferta y permite volver a la inscripción habitual', async () => {
  const form = makeForm(); form.emit([{ ...campaign(), summaryTerms: '', billingText: 'Calendario pendiente de revisión. '.repeat(30), commitmentText: 'Permanencia pendiente de revisión. '.repeat(30) }]); form.select();
  assert.equal(form.element('copy-campaign-summary').disabled, true);
  assert.match(form.element('campaign-copy-status').textContent, /supera el límite/);
  form.element('campaign-accept').checked = true; form.element('campaign-accept').dispatchEvent({ type: 'change' });
  assert.equal(form.element('continuar').disabled, true);
  form.element('use-promotion').checked = false; form.element('use-promotion').dispatchEvent({ type: 'change' });
  assert.equal(form.element('continuar').disabled, false);
});

test('una pestaña abierta restaura el enlace original al caducar y una pausa o cambio de condiciones obliga a revisar de nuevo', () => {
  const form = makeForm(); form.emit(); form.select('Bajo');
  form.element('campaign-accept').checked = true; form.element('campaign-accept').dispatchEvent({ type: 'change' });
  form.tick(campaign().endsAt + 1);
  assert.equal(form.element('campaign-banner').style.display, 'none'); assert.equal(form.element('campaign-selection').style.display, 'none');
  form.element('continuar').handlers.click(); assert.equal(form.context.window.location.href, turn.url);
  form.tick(inCampaign); form.emit(); form.select();
  form.element('campaign-accept').checked = true; form.element('campaign-accept').dispatchEvent({ type: 'change' });
  form.emit([{ ...campaign(), conditions: 'Nuevas condiciones revisadas' }]);
  assert.equal(form.element('campaign-accept').checked, false); assert.equal(form.element('continuar').disabled, true);
  form.emit([{ ...campaign(), status: 'paused' }]); assert.equal(form.element('campaign-banner').style.display, 'none');
});

test('el visitante puede desactivar y reactivar la promoción sin perder su turno ni quedar sujeto a enero o a la permanencia', () => {
  const form = makeForm(); form.emit([campaign()], [{ ...turn, inicio: '2026-12-07' }]); form.select('Bajo');
  assert.equal(form.element('use-promotion').checked, true);
  assert.match(form.element('summaryBody').textContent, /enero de 2027/);
  form.element('use-promotion').checked = false; form.element('use-promotion').dispatchEvent({ type: 'change' });
  assert.equal(form.element('horario').value, turn.selectionId);
  assert.equal(form.element('continuar').disabled, false);
  assert.equal(form.element('campaign-selection').style.display, 'none');
  assert.equal(form.element('campaign-payment-note').style.display, 'none');
  assert.equal(form.element('standard-payment-note').style.display, 'block');
  assert.match(form.element('summaryBody').textContent, /07\/12\/2026/);
  assert.doesNotMatch(form.element('summaryBody').textContent, /enero de 2027/);
  assert.match(form.element('summaryBody').textContent, /60/);
  form.element('continuar').handlers.click(); assert.equal(form.context.window.location.href, turn.url);
  form.emit([campaign()], [{ ...turn, inicio: '2026-12-07' }]);
  assert.equal(form.element('use-promotion').checked, false);
  form.tick(inCampaign + 60000); assert.equal(form.element('use-promotion').checked, false);
  form.element('use-promotion').checked = true; form.element('use-promotion').dispatchEvent({ type: 'change' });
  assert.equal(form.element('continuar').disabled, true);
  assert.equal(form.element('campaign-selection').style.display, 'block');
  assert.match(form.element('campaign-summary').value, /Cuota promocional.*30/);
  assert.match(form.element('campaign-summary').value, /Permanencia durante enero, febrero y marzo/);
  assert.equal(form.element('campaign-accept').checked, false);
  form.element('campaign-accept').checked = true; form.element('campaign-accept').dispatchEvent({ type: 'change' });
  form.element('continuar').handlers.click(); assert.equal(form.context.window.location.href, campaign().commonUrl);
});

test('la estructura admite otra campaña y respeta el enlace original si no se elige la oferta o el turno queda excluido', () => {
  const other = { ...campaign(), id: 'verano-2027', name: 'Campaña de verano', startsAt: promo.madridMillis('2027-05-01T00:00'), endsAt: promo.madridMillis('2027-05-31T23:59', true),
    discountType: 'fixed', discountValue: 10, durationType: 'months', durationMonths: 2, intakeMonth: '2027-07', benefitStartMonth: '2027-07', commitmentText: '', conditions: 'Condiciones de verano', billingText: 'Cobro tras confirmar la plaza', instruments: ['Ukelele'] };
  const now = Date.parse('2027-05-12T12:00:00Z');
  const withOffer = promo.quote([other], turn, 'Ukelele', 'group', now, true);
  assert.equal(withOffer.discountedCents, 5000); assert.equal(withOffer.destination, other.commonUrl); assert.match(withOffer.durationLabel, /julio de 2027/);
  const ordinary = promo.quote([other], turn, 'Ukelele', 'group', now, false);
  assert.equal(ordinary.eligible, false); assert.equal(ordinary.discountedCents, 6000); assert.equal(ordinary.destination, turn.url);
  assert.equal(promo.quote([other], turn, 'Bajo', 'group', now, true).destination, turn.url);
});

test('la promoción limita los turnos ofrecidos y al desactivarla o caducar se recupera todo el listado', () => {
  const form = makeForm();
  const other = { ...turn, selectionId: 'guitar-other-time', timeStr: '18:00', horario: 'Martes a las 18:00h', dayNum: 2 };
  form.emit([{ ...campaign(), selectionIds: [turn.selectionId] }], [turn, other]); form.select('Bajo');
  const options = () => form.element('horario').options.map(item => item.value);
  assert.deepEqual(options(), [turn.selectionId]);
  assert.match(form.element('promotion-choice-help').textContent, /horarios incluidos/);
  form.element('use-promotion').checked = false; form.element('use-promotion').dispatchEvent({ type: 'change' });
  assert.deepEqual(options(), [turn.selectionId, other.selectionId]);
  form.change('horario', other.selectionId);
  form.element('use-promotion').checked = true; form.element('use-promotion').dispatchEvent({ type: 'change' });
  assert.deepEqual(options(), [turn.selectionId]); assert.equal(form.element('horario').value, '');
  assert.equal(form.element('continuar').disabled, true);
  form.tick(campaign().endsAt + 1);
  assert.equal(form.element('campaign-banner').style.display, 'none'); assert.deepEqual(options(), [turn.selectionId, other.selectionId]);
  form.change('horario', ''); assert.equal(form.element('continuar').disabled, true);
});

test('si no hay turnos incluidos se explica cómo ver todos; al comenzar la campaña se aplica el filtro en una pestaña abierta', () => {
  const form = makeForm(); form.tick(campaign().startsAt - 1);
  form.emit([{ ...campaign(), centers: ['Tarragona'] }], [turn]); form.select('Guitarra');
  assert.equal(form.element('campaign-banner').style.display, 'none'); assert.equal(form.element('horario').options.length, 1);
  form.tick(inCampaign);
  assert.equal(form.element('campaign-banner').style.display, 'block');
  assert.equal(form.element('use-promotion').checked, true); assert.equal(form.element('horario').options.length, 0);
  assert.equal(form.element('promotion-empty-turns').style.display, 'block');
  form.element('use-promotion').checked = false; form.element('use-promotion').dispatchEvent({ type: 'change' });
  assert.equal(form.element('horario').options.length, 1); assert.equal(form.element('promotion-empty-turns').style.display, 'none');
});

async function makeAdmin(onSave, extraProps = {}) {
  const compiled = (await transformWithOxc(await readFile('src/components/EnrollmentPromotionsAdmin.jsx', 'utf8'), 'EnrollmentPromotionsAdmin.jsx')).code;
  const tree = parse(compiled, { ecmaVersion: 'latest', sourceType: 'module', range: true });
  const slots = [], effects = []; let index = 0, result;
  const hooks = {
    useState(initial) { const at = index++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], value => { slots[at] = typeof value === 'function' ? value(slots[at]) : value; }]; },
    useEffect(callback, deps) { const at = index++; if (!slots[at] || deps.some((value, i) => !Object.is(value, slots[at][i]))) { slots[at] = deps; effects.push(callback); } }
  };
  const dependencies = { react: hooks, 'react/jsx-runtime': runtime, './enrollmentPromotions.js': promotionHelpers };
  const context = { Date, crypto: { randomUUID: () => 'new-campaign' }, setInterval: () => 1, clearInterval() {} };
  let code = '', end = 0;
  for (const node of tree.body) if (node.type === 'ImportDeclaration') {
    code += compiled.slice(end, node.range[0]);
    for (const specifier of node.specifiers) context[specifier.local.name] = dependencies[node.source.value][specifier.imported.name];
    end = node.range[1];
  } else if (node.type === 'ExportDefaultDeclaration') { code += compiled.slice(end, node.range[0]); end = node.declaration.range[0]; }
  code += compiled.slice(end) + '\nglobalThis.Component = EnrollmentPromotionsAdmin;'; vm.runInNewContext(code, context);
  const render = () => { index = 0; result = context.Component({ classes: [turn], centers: [{ name: 'Reus' }], instruments: ['Guitarra'], onSave, ...extraProps }); effects.splice(0).forEach(fn => fn()); };
  const nodes = () => { const all = []; const visit = node => { if (Array.isArray(node)) node.forEach(visit); else if (node?.props) { all.push(node); visit(node.props.children); } }; visit(result); return all; };
  const field = text => { const label = nodes().find(node => node.type === 'label' && node.props.children?.[0] === text); return label?.props.children.find(node => ['input', 'select', 'textarea'].includes(node?.type)); };
  const button = text => nodes().find(node => node.type === 'button' && node.props.children === text);
  render(); return { nodes, field, button, render };
}

test('Administración prepara Black Friday en borrador, exige guardar y conserva el texto ante un fallo de guardado', async () => {
  const saved = []; let fail = true;
  const admin = await makeAdmin(async values => { if (fail) throw Error('offline'); saved.push(values); });
  assert.equal(saved.length, 0); assert.equal(admin.field('Estado').props.value, 'draft');
  assert.match(admin.field('Condiciones completas visibles en la web').props.value, /enero, febrero y marzo/);
  admin.field('Estado').props.onChange({ target: { value: 'enabled' } }); admin.render();
  await admin.button('Guardar campañas').props.onClick(); admin.render();
  assert.equal(saved.length, 0); assert.equal(admin.field('Estado').props.value, 'enabled');
  assert.ok(admin.nodes().find(node => node.props.role === 'status' && String(node.props.children).includes('No se pudieron guardar')));
  fail = false; await admin.button('Guardar campañas').props.onClick(); admin.render();
  assert.equal(saved.length, 1); assert.equal(saved[0][0].commonUrl, 'https://qow.es/MBTHVp');
  assert.deepEqual(Array.from(saved[0][0].modes), ['group']); assert.equal(saved[0][0].discountValue, 50);
});

test('los tamaños de grupo incluyen clases existentes sin plazas y filtros guardados, sin limitarse a los ejemplos publicados', async () => {
  const admin = await makeAdmin(async () => {}, { groupSizes: [1, 3, 5, 8, 0, -1], campaigns: [{ ...blackFriday2026Draft(), capacities: ['7'] }] });
  const labels = admin.nodes().filter(node => node.type === 'label').flatMap(node => Array.isArray(node.props.children) ? node.props.children.filter(item => typeof item === 'string') : []);
  for (const size of [1, 3, 4, 5, 7, 8]) assert.ok(labels.includes(`${size} personas`));
  assert.equal(labels.includes('0 personas'), false); assert.equal(labels.includes('-1 personas'), false);
});

test('Administración rechaza un resumen excesivo y permite guardar tras indicar condiciones breves', async () => {
  const saved = [], admin = await makeAdmin(async values => saved.push(values));
  for (const [name, value] of [['Estado', 'enabled'], ['Condiciones breves para el resumen de Tadosi (opcional)', ''], ['Calendario y condiciones de cobro', 'Calendario de cobros por revisar. '.repeat(30)], ['Permanencia de esta promoción (opcional)', 'Permanencia por revisar. '.repeat(30)]]) {
    admin.field(name).props.onChange({ target: { value } }); admin.render();
  }
  await admin.button('Guardar campañas').props.onClick(); admin.render();
  assert.equal(saved.length, 0);
  assert.ok(admin.nodes().find(node => node.props.role === 'status' && String(node.props.children).includes('1.000 caracteres')));
  admin.field('Condiciones breves para el resumen de Tadosi (opcional)').props.onChange({ target: { value: 'Enero se cobra en diciembre; permanencia hasta marzo.' } }); admin.render();
  await admin.button('Guardar campañas').props.onClick(); assert.equal(saved.length, 1);
});

test('el publicador real incluye la campaña en su firma y conserva plazas, enlaces y privacidad de la oferta', async () => {
  const admin = await readFile('src/components/AdminPortal.jsx', 'utf8');
  const parsed = parse(admin, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
  let callback;
  const walk = node => { if (!node || typeof node !== 'object') return; if (node.type === 'VariableDeclarator' && node.id.name === 'publicAvailabilityPublication') callback = node.init.arguments[0]; for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value); };
  walk(parsed); assert.ok(callback);
  const baseClass = { id: 'same-id', refPath: 'artifacts/demo/users/teacher/recurringClasses/same-id', isWebVisible: true, subject: 'Guitarra', sede: 'Reus', capacity: 4, dayOfWeek: 1, time: '19:00', price: '60 €/mes', tadosiUrl: turn.url, students: [{ id: 's' }], notes: 'nota privada', teacherEmail: 'private@example.com' };
  const context = { students: [{ id: 's', name: 'Nombre privado', email: 'private@example.com', globalStatus: 'activo' }], recurringClassesOnly: [baseClass], settings: { enrollmentPromotions: [campaign()], secretSetting: 'no publicar' }, todayStr: '2026-11-24', enrollmentPromotions: promo,
    isPunctualClass: () => false, buildPublicClassSelectionId, isPublicExpansionSeat, getFormationMinimumStudentCount: () => 2, normalizeGestionDateString: value => value, getDayName: () => 'Lunes', buildPublicAvailabilitySignature: JSON.stringify,
    centers: [], isCenterOpenForEnrollment: () => true, getClassCenterName: clase => clase.sede };
  const run = () => JSON.parse(JSON.stringify(vm.runInNewContext(`(${admin.slice(...callback.range)})()`, context)));
  const first = run(); assert.equal(first.classes[0].plazas, 3); assert.equal(first.classes[0].url, turn.url); assert.equal(first.classes[0].precio, '60 €/mes');
  assert.equal(first.campaigns[0].commonUrl, campaign().commonUrl); assert.equal(JSON.stringify(first).includes('private@example.com'), false); assert.equal(JSON.stringify(first).includes('Nombre privado'), false); assert.equal(JSON.stringify(first).includes('nota privada'), false);
  baseClass.students.push({ id: 'recovery', isRecovery: true }); assert.equal(run().classes[0].plazas, 3);
  context.settings.enrollmentPromotions = [{ ...campaign(), conditions: 'Condiciones revisadas' }]; const changed = run(); assert.notEqual(first.signature, changed.signature); assert.deepEqual(first.classes, changed.classes);
  context.settings.enrollmentPromotions = [{ ...campaign(), status: 'paused' }]; assert.deepEqual(run().campaigns, []);
  context.isCenterOpenForEnrollment = () => false;
  assert.deepEqual(run().classes, []);
});
