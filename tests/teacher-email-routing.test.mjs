import test from 'node:test';
import {createRecoveryCapacityStore} from '../src/components/recoveryCapacityStore.js';
import {recoveryAvailabilityId} from '../src/components/recoveryCapacityUtils.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parse } from 'espree';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const student = await readFile('src/components/StudentPortal.jsx', 'utf8');
const admin = await readFile('src/components/AdminPortal.jsx', 'utf8');
const parseSource = source => parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
const walk = (node, visitor) => {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const [key, child] of Object.entries(node)) {
    if (key !== 'range') Array.isArray(child) ? child.forEach(item => walk(item, visitor)) : walk(child, visitor);
  }
};
const studentAst = parseSource(student), adminAst = parseSource(admin);
const declaration = (ast, name) => {
  let found;
  walk(ast, node => { if (node.type === 'VariableDeclarator' && node.id.name === name) found = node.init; });
  assert.ok(found, name); return found;
};
const evaluate = (source, node, context) => vm.runInNewContext(`(${source.slice(...node.range)})`, context);
const helpers = {};
for (const name of ['normalizeTeacherKey', 'uniqueStrings', 'getTeacherOperationalEmail']) {
  helpers[name] = evaluate(student, declaration(studentAst, name), helpers);
}
const configured = { 'Martí Viñas': ' Martivg@escuelalosmitos.com ', 'Elia': 'elia@escuelalosmitos.com' };
const plain = value => JSON.parse(JSON.stringify(value));

test('la dirección configurada prevalece sobre el nombre y no se inventan destinatarios', () => {
  for (const name of ['Marti Viñas', '  MARTÍ VIÑAS  ', 'marti vinas']) {
    assert.equal(helpers.getTeacherOperationalEmail(name, configured), 'martivg@escuelalosmitos.com');
  }
  assert.equal(helpers.getTeacherOperationalEmail('Sin configurar', configured), '');
  assert.equal(helpers.getTeacherOperationalEmail('Marti Viñas'), '');
  for (const email of ['marti.viñas@escuelalosmitos.com', 'privado@example.com', 'bad\n@escuelalosmitos.com']) {
    assert.equal(helpers.getTeacherOperationalEmail('Marti Viñas', { 'Marti Viñas': email }), '');
  }
  assert.equal(helpers.getTeacherOperationalEmail('Marti Viñas', { 'Martí Viñas': 'uno@escuelalosmitos.com', 'Marti Vinas': 'otro@escuelalosmitos.com' }), '');
});

test('el contacto directo usa los profesores habituales de las plazas fijas vigentes', () => {
  const context = { ...helpers, activeTab: 'contact', profile: { id: 's' }, todayStr: '2026-11-06' };
  for (const name of [
    'isPunctualClass', 'isFixedClassStudent', 'isPendingClassStartEntry', 'normalizeClassDate', 'getStudentEntryId',
    'isStudentEntryFor', 'getClassEntryStartDate', 'getClassEntryEndDate', 'isStudentEntryActiveOnDate',
    'getClassTeacherLoginEmail', 'getTeacherContactOptions'
  ]) {
    context[name] = evaluate(student, declaration(studentAst, name), context);
  }
  const seat = (teacher, subject, entry = {}, clase = {}) => ({ teacher, subject, students: [{ id: 's', ...entry }], ...clase });
  context.myClasses = [
    seat('Martí Viñas', 'Batería', {}, {
      id: 'a', refPath: 'classes/a', authorizedTeacherKeys: ['marti vinas', 'profesor temporal'],
      authorizedTeacherEmails: ['martivg@escuelalosmitos.com', 'temporal@escuelalosmitos.com']
    }),
    seat('marti vinas', 'Combo'),
    seat('Elia', 'Canto', { classEndDate: '2026-11-20' }, {
      id: 'a', refPath: 'centers/reus/classes/a', authorizedTeacherKeys: ['elia'],
      authorizedTeacherEmails: ['cuenta-docente@escuelalosmitos.com']
    }),
    seat('Sin autorización', 'Piano', {}, {
      authorizedTeacherKeys: ['profesor temporal'], authorizedTeacherEmails: ['temporal@escuelalosmitos.com']
    }),
    seat('Recuperación', 'Batería', { isRecovery: true }),
    seat('Traslado', 'Combo', { isTemporaryRelocation: true }),
    seat('Puntual', 'Piano', {}, { date: '2026-11-06' }),
    seat('Otro alumno', 'Canto', { id: 'otro' }),
    seat('Alta futura', 'Batería', { classStartDate: '2026-11-07' }),
    seat('Alta pendiente', 'Batería', { pendingStart: true }),
    seat('Plaza finalizada', 'Canto', { classEndDate: '2026-11-05' })
  ];
  const eligible = evaluate(student, declaration(studentAst, 'teacherContactClasses'), context);
  const options = context.getTeacherContactOptions(eligible, clase => clase.subject);
  assert.deepEqual(plain(options.map(({ name, email, classLabels }) => [name, email, [...classLabels]])), [
    ['Martí Viñas', 'martivg@escuelalosmitos.com', ['Batería', 'Combo']],
    ['Elia', 'cuenta-docente@escuelalosmitos.com', ['Canto']],
    ['Sin autorización', '', ['Piano']]
  ]);
  const conflicting = seat('Martí Viñas', 'Combo', {}, {
    authorizedTeacherKeys: ['marti vinas'], authorizedTeacherEmails: ['otra-cuenta@escuelalosmitos.com']
  });
  assert.equal(context.getTeacherContactOptions([eligible[0], conflicting], clase => clase.subject)[0].email, '');
});

test('el contacto directo evita inventar un correo o usar el de un temporal como suplencia', () => {
  const resolve = evaluate(student, declaration(studentAst, 'getClassTeacherLoginEmail'), helpers);
  assert.equal(resolve({ teacher: 'Elia' }), '');
  assert.equal(resolve({ teacher: 'Elia', authorizedTeacherEmails: ['elia@escuelalosmitos.com'] }), '');
  assert.equal(resolve({ teacher: 'Elia', authorizedTeacherKeys: ['elia', 'temporal'], authorizedTeacherEmails: ['', 'temporal@escuelalosmitos.com'] }), '');
  assert.equal(resolve({ teacher: 'Elia', authorizedTeacherKeys: ['elia'], authorizedTeacherEmails: ['personal@example.com'] }), '');
});

test('la sincronización conserva al titular en primer lugar cuando se intercambia con un temporal', () => {
  let updateAuthorization;
  walk(adminAst, node => {
    if (node.type === 'CallExpression' && node.callee.object?.property?.name === 'classAuthorizations'
      && node.callee.property?.name === 'forEach') updateAuthorization = node.arguments[0];
  });
  assert.ok(updateAuthorization);
  const operations = [];
  const sync = evaluate(admin, updateAuthorization, {
    operations, db: {}, doc: (_db, path) => path,
    sameStringSet: () => true
  });
  const desired = ['elia', 'marti vinas'];
  const desiredEmails = ['elia@escuelalosmitos.com', 'martivg@escuelalosmitos.com'];
  sync({ refPath: 'classes/a', current: [...desired].reverse(), desired, currentEmails: [...desiredEmails].reverse(), desiredEmails });
  assert.equal(operations.length, 1);
  operations[0]({ update: (path, data) => {
    assert.equal(path, 'classes/a');
    assert.deepEqual(plain(data), { authorizedTeacherKeys: desired, authorizedTeacherEmails: desiredEmails });
  } });
});

test('la tarjeta de contacto abre un borrador, muestra los destinatarios y explica el alcance', async () => {
  const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
  try {
    const { default: Card } = await server.ssrLoadModule('/src/components/TeacherContactCard.jsx');
    const teacher = { key: 'marti', name: 'Martí', email: 'marti+clases#1@escuelalosmitos.com', classLabels: new Set(['Batería · Viernes 18:00']) };
    const render = contacts => renderToStaticMarkup(createElement(Card, { contacts }));
    const single = render([teacher]);
    assert.match(single, /href="mailto:marti%2Bclases%231@escuelalosmitos\.com\?subject=Consulta%20de%20clase"/);
    assert.match(single, /Contactar con mi profesor/);
    assert.match(single, /Copiar dirección/);
    assert.match(single, /El profesorado no tramita gestiones administrativas/);
    assert.match(single, /bg-black text-left text-white/);
    assert.match(single, /flex items-center justify-between/);
    assert.doesNotMatch(single, /<summary/);

    const unavailable = { key: 'elia', name: 'Elia', email: '', classLabels: new Set(['Canto · Jueves 19:00']) };
    const multiple = render([teacher, unavailable]);
    assert.match(multiple, /<summary/);
    assert.match(multiple, /Batería · Viernes 18:00/);
    assert.match(multiple, /Canto · Jueves 19:00/);
    assert.match(multiple, /El correo de este profesor no está disponible/);
    assert.equal((multiple.match(/href="mailto:/g) || []).length, 1);
    assert.doesNotMatch(render([unavailable]), /href="mailto:/);
  } finally { await server.close(); }
});

test('admin publica solo el mapa corporativo necesario, sin el resto de ajustes privados', () => {
  const publication = evaluate(admin, declaration(adminAst, 'studentSettingsPublication'), {
    settings: { teacherEmails: { ...configured, Privado: 'personal@example.com', Incorrecto: 'marti.viñas@escuelalosmitos.com' }, costeEmpresa: 23.84, gastosFijos: { global: 500 }, teachersList: ['Martí Viñas'] },
    useMemo: callback => callback(), cleanTeacherDisplayName: name => String(name).trim().replace(/\s+/g, ' '),
    normalizeMusicOrder: () => [], isCalendarDate: () => false, vacationDeadlineMillis: () => 0,
    Timestamp: { fromMillis: value => value }, defaultInstrumentos: [], normalizeCenters: () => [],
    buildPublicAvailabilitySignature: data => JSON.stringify(data)
  });
  assert.deepEqual(plain(publication.data.teacherEmails), { 'Martí Viñas': 'martivg@escuelalosmitos.com', Elia: 'elia@escuelalosmitos.com' });
  assert.equal(publication.data.costeEmpresa, undefined); assert.equal(publication.data.gastosFijos, undefined);
  assert.match(publication.signature, /martivg@escuelalosmitos.com/);
});

function absenceSetup({ emails = configured, failFetch = false, late = false, allAbsent = false } = {}) {
  const writes = [], emailsSent = [], messages = [], state = {};
  const context = {
    ...helpers, absenceModal: { clase: { id: 'bateria', refPath: 'classes/bateria', teacher: 'Marti Viñas', subject: 'Batería', time: '19:00', students: allAbsent ? [{ id: 's' }] : [{ id: 's' }, { id: 'otro' }] }, dateStr: '2026-11-03', diffHours: late ? 1 : 24 },
    profile: { id: 's', name: 'Alumno de prueba', email: 'student@example.com' }, user: { email: 'student@example.com' },
    globalSettings: { teacherEmails: emails }, isSendingAbsence: false,
    setIsSendingAbsence: value => { state.sending = value; }, setAbsenceModal: value => { state.modal = value; },
    isStudentInMaintenanceForDate: () => false, getStudentEntryId: entry => entry.id,
    formatDateSpanish: value => value, db: {}, appId: 'demo', APPS_SCRIPT_URL: 'test://script',
    doc: (_db, ...path) => path.join('/'), setDoc: async (path, data) => { writes.push({ path, data: plain(data) }); },
    runTransaction: async (_db, callback) => callback({ get: async () => ({ exists: () => true, data: () => context.absenceModal.clase }), set: (path, data) => { writes.push({ path, data: plain(data) }); } }),
    fetch: async (_url, options) => { if (failFetch) throw Error('sin red'); emailsSent.push(JSON.parse(options.body)); return {}; },
    showToast: message => messages.push(message), console: { warn() {} }
  };
  return { writes, emailsSent, messages, state, confirm: evaluate(student, declaration(studentAst, 'confirmAbsence'), context) };
}

test('el aviso real y su gestión usan martivg también en las variantes de clase vacía y aviso tardío', async () => {
  for (const options of [{}, { late: true }, { allAbsent: true }, { allAbsent: true, late: true }]) {
    const run = absenceSetup(options); await run.confirm(true);
    assert.equal(run.emailsSent.length, 1);
    assert.equal(run.emailsSent[0].teacherEmail, 'martivg@escuelalosmitos.com');
    assert.equal(run.emailsSent[0].type, 'notificacion_profesor');
    const gestion = run.writes.find(write => write.data.type === 'aviso_ausencia').data;
    assert.deepEqual(gestion.teacherEmails, ['martivg@escuelalosmitos.com']);
    assert.equal(gestion.ticketEligible, !options.late);
    assert.equal(run.state.sending, false); assert.equal(run.state.modal, null);
    assert.match(run.messages[0], /envío de correo solicitado/);
  }
});

test('sin correo configurado o sin red se conserva la ausencia y no se anuncia una entrega inexistente', async () => {
  for (const options of [{ emails: {} }, { failFetch: true }]) {
    const run = absenceSetup(options); await run.confirm(true);
    assert.equal(run.emailsSent.length, 0); assert.equal(run.writes.length, 2);
    assert.equal(run.writes[1].data.status, 'pendiente');
    assert.match(run.messages[0], /Ausencia registrada\. No se pudo solicitar/);
    if (options.emails) assert.deepEqual(run.writes[1].data.teacherEmails, []);
    assert.equal(run.state.sending, false);
  }
});

test('gestiones y autorización de recuperaciones utilizan la misma cuenta sin añadir correos vacíos', async () => {
  const sendGestion = declaration(studentAst, 'sendGestion');
  let payloadNode;
  walk(sendGestion, node => { if (node.type === 'VariableDeclarator' && node.id.name === 'payload') payloadNode = node.init; });
  const emailsNode = payloadNode.properties.find(node => node.key?.name === 'teacherEmails').value;
  for (const emails of [configured, {}]) {
    const updates = [];
    const context = { ...helpers, globalSettings: { teacherEmails: emails }, resolvedSourceClass: { teacher: 'Marti Viñas' }, selectedNewClass: { teacher: 'Elia' } };
    const recipients = evaluate(student, emailsNode, context);
    assert.deepEqual(plain(recipients), emails === configured ? ['martivg@escuelalosmitos.com', 'elia@escuelalosmitos.com'] : []);
    const payload={studentId:'s',studentEmail:'s@example.com',requestedClassRefPath:'classes/c',requestedSubject:'Piano',requestedTeacher:'Elia',recoveryDate:'2026-11-11',teacherEmails:plain(recipients),teacherKeys:['elia']};
    const ticket={refPath:'artifacts/demo/users/origin/tickets/t'};
    const documents=new Map([
      [`artifacts/demo/recoveryAvailability/${recoveryAvailabilityId('classes/c')}`,{enabled:true,capacity:4,revision:1,sessions:{'2026-11-11':{baseCount:3,recoveryCount:0,holds:[]}}}],
      [ticket.refPath,{studentId:'s',subject:'Piano'}]
    ]);
    const sdk={doc:(_db,...parts)=>parts.join('/'),arrayUnion:(...values)=>values,runTransaction:async(_db,callback)=>callback({
      get:async path=>({exists:()=>documents.has(path),data:()=>documents.get(path)}),set(){},update:(path,data)=>{if(path===ticket.refPath)updates.push(plain(data));}
    })};
    await createRecoveryCapacityStore({db:{},appId:'demo',sdk}).reserve({gestionId:'g',payload,ticket});
    assert.deepEqual(updates[0].recoveryTeacherEmails,plain(recipients));
    assert.deepEqual(updates[0].recoveryTeacherKeys,['elia']);
  }
});

test('el cierre cuatrimestral mantiene los campos y premios anteriores y publica el nuevo nombre', async () => {
  const updates = [], publications = [], confirmations = [], alerts = [];
  const players = [{ id: 's', name: 'Alumno', triviaPoints: 10, triviaPointsQuarterly: 25, triviaPointsAnnual: 50 }];
  const context = {
    students: players, settings: { prizes: { mensual: 'Premio mensual', trimestral: 'Premio conservado' } },
    buildTriviaPodium: (students, score) => [{ students, score: score(students[0]) }],
    buildTriviaResultSection: (title, _podium, prize) => `${title}: ${prize}`,
    publishTriviaClosure: async (...args) => publications.push(args), setLoading() {},
    db: {}, appId: 'demo', doc: (...args) => args, updateDoc: async (_ref, data) => updates.push(plain(data)),
    alert: message => alerts.push(message), window: { confirm: message => { confirmations.push(message); return true; } }
  };
  for (const name of ['getTriviaPrize', 'ensureTriviaPrizes', 'handleCerrarRetoTrimestral']) context[name] = evaluate(admin, declaration(adminAst, name), context);
  await context.handleCerrarRetoTrimestral();
  assert.deepEqual(updates, [{ triviaPoints: 0, triviaPointsQuarterly: 0, triviaPointsAnnual: 60 }]);
  assert.match(publications[0][0], /cuatrimestral/); assert.match(publications[0][1], /Resultado cuatrimestral: Premio conservado/);
  assert.equal(publications[0][2], 'trimestral'); // Existing stored identifier, not a visible label.
  assert.match(confirmations[0], /CUATRIMESTRE/); assert.match(alerts[0], /Cuatrimestre cerrado/);
});
