import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parse } from 'espree';
import * as expansion from '../src/components/classExpansionUtils.js';

const today = '2026-11-03';
const futureClass = { id: 'future', refPath: 'classes/future', subject: 'Guitarra', teacher: 'Paco', dayOfWeek: 2, time: '18:00', capacity: 4, students: [], activeStudentCount: 0, committedSeatCount: 0, startDate: '2026-11-17', autoAdvanceStartDate: false, isWebVisible: true };
const publicRow = clase => ({ selectionId: expansion.buildPublicClassSelectionId(clase.refPath || clase.id), escuela: 'Reus', instrumento: clase.subject, horario: 'Martes a las 18:00h', dayNum: clase.dayOfWeek, timeStr: clase.time, maxCap: clase.capacity, plazas: clase.capacity - (clase.committedSeatCount || 0), inicio: clase.startDate || null, autoAdvanceStartDate: clase.autoAdvanceStartDate === true });

test('se usa la oferta publicada incluso sin activos, con fechas heredadas o en formación', () => {
  const rows = [futureClass, { ...futureClass, id: 'old', refPath: 'classes/old', startDate: '', specificDate: '2026-01-01' }, { ...futureClass, id: 'formation', refPath: 'classes/formation', autoAdvanceStartDate: true }];
  const result = expansion.getPublicExpansionClasses({ classes: rows.map(publicRow) }, rows, [], today, 'Guitarra');
  assert.equal(result.length, 3); assert.equal(result.find(row => row.id === 'old').publicFreeSpots, 4);
  assert.equal(result.find(row => row.id === 'formation').autoAdvanceStartDate, true);
});

test('la incorporación respeta apertura, día semanal y fechas civiles válidas', () => {
  assert.equal(expansion.getExpansionStartDate(futureClass, today), '2026-11-17');
  assert.equal(expansion.getExpansionStartDate({ ...futureClass, startDate: '2026-11-18' }, today), '2026-11-24');
  assert.equal(expansion.getExpansionStartDate({ ...futureClass, startDate: '2026-12-30' }, today), '2027-01-05');
  assert.equal(expansion.getExpansionDateError(futureClass, '2026-11-24', today), '');
  for (const date of ['2026-11-10', '2026-11-18', '2026-11-32', '', '2026-10-27']) assert.ok(expansion.getExpansionDateError(futureClass, date, today));
  assert.equal(expansion.isExpansionDate('2028-02-29'), true); assert.equal(expansion.isExpansionDate('2027-02-29'), false);
});

const studentSource = await readFile('src/components/StudentPortal.jsx', 'utf8');
const adminSource = await readFile('src/components/AdminPortal.jsx', 'utf8');
const ast = source => parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
const studentAst = ast(studentSource), adminAst = ast(adminSource);
const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, child] of Object.entries(node)) if (key !== 'range') Array.isArray(child) ? child.forEach(item => walk(item, visit)) : walk(child, visit);
};
const findDeclaration = (tree, name) => { let found; walk(tree, node => { if (node.type === 'VariableDeclarator' && node.id.name === name) found = node.init; }); assert.ok(found, name); return found; };
const evaluate = (source, node, context) => vm.runInNewContext(`(${source.slice(...node.range)})`, context);
const plain = value => JSON.parse(JSON.stringify(value));

test('el selector real usa la oferta web para ampliar y conserva los destinos de recuperación y cambio', () => {
  const start = studentSource.indexOf('    let availableClasses = [];', studentSource.indexOf('  const renderGestionModal'));
  const end = studentSource.indexOf('    const isMaintenanceChoiceInvalid', start);
  const select = context => vm.runInNewContext(`(() => {${studentSource.slice(start, end)}; return availableClasses;})()`, context);
  const active = { ...futureClass, id: 'active', activeStudentCount: 2, startDate: '' };
  const classes = [futureClass, active, { ...futureClass, id: 'formation', autoAdvanceStartDate: true }, { ...futureClass, id: 'hidden', isWebVisible: false }, { ...futureClass, id: 'full', committedSeatCount: 4 }, { ...active, id: 'own' }].map(row => ({ ...row, refPath: `classes/${row.id}` }));
  for (const type of ['ampliar_clases', 'recuperacion', 'cambio_horario']) {
    const result = select({
      ...expansion, allClasses: classes, targetInstrument: 'Guitarra', gestionModal: { type }, isClassSearch: true, resolvedSourceClass: {}, isTicketRedemption: type === 'recuperacion', isAmpliarClases: type === 'ampliar_clases', todayStr: today,
      publicExpansion: { payload: { classes: classes.filter(row => row.isWebVisible).map(publicRow) } }, expansionOwnedClasses: [classes.at(-1)],
      getCommittedSeatCountForClass: clase => clase.committedSeatCount, getRecoveryDatesForClass: () => ['2026-11-17'], selectedRecoveryTicket: {}, fixedSeatClasses: [], getClassRefPath: row => row.refPath || `classes/${row.id}`, myClasses: [{ id: 'own' }], getClassDocumentId: clase => clase.id
    });
    assert.deepEqual(result.map(clase => clase.id).sort(), type === 'ampliar_clases' ? ['active', 'formation', 'future'] : type === 'recuperacion' ? [] : ['active']);
  }
});

test('el catálogo publica apertura y formación sin introducir actividad ni alumnado en una clase vacía', () => {
  const result = evaluate(adminSource, findDeclaration(adminAst, 'studentClassCatalogPublication'), {
    operationalClasses: [futureClass], useMemo: callback => callback(), todayStr: today,
    getCommercialSeatDataForClass: () => ({ cap: 4, committedCount: 0, freeSpots: 4 }), getMitoboxOccupancyForClass: () => [],
    isMitoboxOccupancyActiveOnDate: () => false, isClassRecoveryEnabled: () => true,
    normalizeGestionDateString: value => value, temporaryClassChanges: [], temporaryRelocations: [], students: [], maintenancePeriods: [],
    buildPublicAvailabilitySignature: value => JSON.stringify(value)
  });
  assert.equal(result.classes[0].startDate, futureClass.startDate); assert.equal(result.classes[0].autoAdvanceStartDate, false);
  assert.equal(result.classes[0].activeStudentCount, 0); assert.deepEqual(plain(result.classes[0].mitoboxOccupancy), []);
  assert.equal(result.classes[0].students, undefined);
});

function adminSetup({ answer = '2026-11-17', changedClass = {}, tadosi = true, promptCancel = false, formation = false, changedPublication = null } = {}) {
  const initialClass = { ...futureClass, autoAdvanceStartDate: formation };
  const student = { id: 's', name: 'Alumno', email: 'student@example.com', classStartDate: '2025-01-01', globalStatus: 'activo' };
  const gestion = { id: 'g', type: 'ampliar_clases', status: 'pendiente', studentId: 's', studentName: 'Alumno', requestedClass: 'future', requestedClassRefPath: futureClass.refPath, requestedClassStartDate: formation ? '' : futureClass.startDate, requestedStartPending: formation, tadosiDone: tadosi };
  const store = new Map([['classes/future', plain({ ...initialClass, ...changedClass })], ['artifacts/demo/gestiones/g', gestion], ['artifacts/demo/students/s', student], ['publicData/classAvailability', changedPublication || { classes: [publicRow(initialClass)] }]]);
  const sent = [], copies = [], messages = [], prompts = [];
  const context = {
    ...expansion, todayStr: today, students: [student], recurringClassesOnly: [initialClass], user: { email: 'admin@example.com' }, db: {}, appId: 'demo',
    isGestionReadyForExecution: item => item.tadosiDone === true || formation, resolveStudentEmail: value => value.email,
    isExtraServiceGestion: () => false, isStudentInMaintenance: () => false,
    formatClassLine: clase => `${clase.subject} ${clase.time} ${clase.teacher}`, formatDateSpanish: value => value,
    doc: (_db, ...path) => path.join('/'),
    getDoc: async ref => ({ exists: () => true, data: () => plain(ref === 'publicData/classAvailability' ? { classes: [publicRow(initialClass)] } : initialClass) }),
    getCommercialSeatDataForClass: clase => ({ cap: clase.capacity, committedCount: clase.students.length, students: clase.students.map(entry => ({ ...entry, isFutureStart: entry.classStartDate > today })) }),
    getFormationActivationPatch: () => ({}), uniqueStrings: values => [...new Set(values)],
    withClassStudentIndex: entries => ({ students: entries, studentIds: entries.map(entry => entry.id) }),
    runTransaction: async (_db, callback) => {
      const staged = [];
      const result = await callback({ get: async ref => ({ exists: () => store.has(ref), data: () => plain(store.get(ref)) }), update: (ref, data) => staged.push([ref, plain(data)]) });
      staged.forEach(([ref, data]) => store.set(ref, { ...store.get(ref), ...data })); return result;
    },
    finalizeGestionStatus: async (...args) => copies.push(args),
    sendTeacherNotification: async data => sent.push(data), sendStudentNotification: async data => sent.push(data),
    alert: value => messages.push(value), window: { confirm: () => true, prompt: (message, suggested) => { prompts.push({ message, suggested }); return promptCancel ? null : answer; } }
  };
  const execute = evaluate(adminSource, findDeclaration(adminAst, 'updateGestionStatus'), context);
  return { store, sent, copies, messages, prompts, gestion, execute: options => execute('g', 'completado', gestion, options) };
}

test('la aprobación real reserva una plaza futura con fecha propia, mantiene la ficha y envía la fecha confirmada', async () => {
  const run = adminSetup({ answer: '2026-11-24' });
  const result = await run.execute(); assert.equal(result.ok, true, result.message);
  const entry = run.store.get('classes/future').students[0];
  assert.equal(entry.classStartDate, '2026-11-24'); assert.equal(entry.scheduledStartDate, '2026-11-24');
  assert.equal(entry.sourceGestionId, 'g'); assert.equal(entry.pendingStart, false);
  assert.equal(run.store.get('artifacts/demo/students/s').classStartDate, '2025-01-01');
  assert.equal(run.store.get('artifacts/demo/gestiones/g').scheduledClassStartDate, '2026-11-24');
  assert.equal(run.sent.length, 2); run.sent.forEach(message => assert.match(message.body, /2026-11-24/));
  assert.match(run.sent[0].body, /No debe aparecer como alumno activo/);
  assert.match(run.copies[0][3], /Tadosi/);
  await run.execute(); assert.equal(run.store.get('classes/future').students.length, 1); assert.equal(run.sent.length, 2);
});

test('la aprobación vuelve a comprobar apertura y aforo antes de escribir y permite cancelar', async () => {
  const cases = [
    { answer: '2026-11-10' }, { answer: '2026-11-18' }, { promptCancel: true }, { tadosi: false },
    { changedClass: { startDate: '2026-11-24' } }, { changedClass: { autoAdvanceStartDate: true } },
    { changedClass: { isWebVisible: false } },
    { changedClass: { students: Array.from({ length: 4 }, (_, index) => ({ id: `other-${index}` })) } }
  ];
  for (const options of cases) {
    const run = adminSetup(options), before = JSON.stringify([...run.store]);
    const result = await run.execute(); assert.equal(result.ok, false, JSON.stringify(options));
    assert.equal(JSON.stringify([...run.store]), before); assert.equal(run.sent.length, 0); assert.equal(run.copies.length, 0);
  }
  const bulk = adminSetup(); assert.equal((await bulk.execute({ silent: true, skipConfirm: true })).ok, false); assert.equal(bulk.prompts.length, 0);
});

test('la solicitud del alumno conserva la fecha y el mes de incorporación sin reservar todavía una plaza', async () => {
  const writes = [], copies = [], messages = [];
  const context = {
    ...expansion, gestionModal: { type: 'ampliar_clases', title: 'Añadir clase' }, gestionText: '',
    isServiceOnlyStudent: false, isMultiSeatStudent: false, isStudentFrozen: false,
    getGestionUiCopy: () => ({}), getAvailableFixedSeatClassesForGestion: () => [],
    allClasses: [futureClass], expansionOwnedClasses: [], publicExpansion: { phase: 'ready', payload: { classes: [publicRow(futureClass)] } }, selectedNewClass: expansion.getPublicExpansionClasses({ classes: [publicRow(futureClass)] }, [futureClass], [], today)[0], todayStr: today,
    getCommittedSeatCountForClass: clase => clase.committedSeatCount,
    profile: { id: 's', name: 'Alumno', email: 'student@example.com' }, user: {}, globalSettings: { teacherEmails: {} },
    getTeacherOperationalEmail: () => '', normalizeTeacherKey: value => String(value || '').toLowerCase(), uniqueStrings: values => [...new Set(values.filter(Boolean))],
    formatClassLineForAdminCopy: clase => clase.subject, getClassCenterName: () => 'Reus', getClassRoomName: () => 'Sala 1', getClassCenter: () => null, getClassRoom: () => null,
    db: {}, appId: 'demo', doc: (_db, ...path) => path.join('/'),
    writeBatch: () => ({ set: (path, data) => writes.push({ path, data: plain(data) }), commit: async () => {} }),
    ADMIN_COPY_GESTION_TYPES: new Set(['ampliar_clases']), sendAdminGestionCopy: async data => { copies.push(data); return false; },
    showToast: message => messages.push(message)
  };
  for (const name of ['setIsSendingGestion','setGestionModal','setGestionText','setSelectedNewClass','setSelectedSourceClass','setSelectedRecoveryTicketId','setSelectedRecoverySubject','setBajaTotalRequested','setSelectedRecoveryDate','setMaintenanceMonths','setAcceptLatePenalty','setSelectedInst']) context[name] = () => {};
  await evaluate(studentSource, findDeclaration(studentAst, 'sendGestion'), context)();
  assert.equal(writes.length, 1, messages.join('\n'));
  assert.equal(writes[0].data.requestedClassStartDate, '2026-11-17'); assert.equal(writes[0].data.targetMonth, 'noviembre');
  assert.equal(writes[0].data.requestedClassRefPath, futureClass.refPath); assert.equal(writes[0].data.status, 'pendiente');
  assert.equal(copies[0].payload.requestedClassStartDate, '2026-11-17');
  assert.equal(messages.at(-1), 'Solicitud enviada a Administración.');
});

test('la asistencia del profesor respeta la fecha de la nueva plaza y no la antigüedad del alumno', async () => {
  const teacherSource = await readFile('src/components/TeacherPortal.jsx', 'utf8'), teacherAst = ast(teacherSource);
  const context = {};
  for (const name of ['normalizeStudentClassDate', 'getStudentClassStartDate', 'hasClassStartedForDate']) context[name] = evaluate(teacherSource, findDeclaration(teacherAst, name), context);
  const entry = { classStartDate: '2026-11-17', pendingStart: false }, profile = { classStartDate: '2025-01-01' };
  assert.equal(context.hasClassStartedForDate(entry, profile, '2026-11-16'), false);
  assert.equal(context.hasClassStartedForDate(entry, profile, '2026-11-17'), true);
});


test('ampliar, cambiar horario y canjear tickets ordenan lunes a domingo y por hora numérica', () => {
  const start = studentSource.indexOf('    let availableClasses = [];', studentSource.indexOf('  const renderGestionModal'));
  const end = studentSource.indexOf('    const isMaintenanceChoiceInvalid', start);
  const slots = [[0, '08:00'], [2, '08:00'], [1, '19:00'], [1, '10:00'], [6, '08:00'], [1, '9:00']];
  const classes = slots.map(([dayOfWeek, time], index) => ({ ...futureClass, id: `c${index}`, refPath: `classes/c${index}`, dayOfWeek, time, capacity: 8, activeStudentCount: 1 }));
  for (const type of ['ampliar_clases', 'cambio_horario', 'recuperacion']) {
    const context = { ...expansion, allClasses: classes, targetInstrument: 'Guitarra', gestionModal: { type }, isClassSearch: true, resolvedSourceClass: {}, isTicketRedemption: type === 'recuperacion', isAmpliarClases: type === 'ampliar_clases', todayStr: today,
      publicExpansion: { payload: { classes: classes.map(publicRow) } }, expansionOwnedClasses: [],
      getCommittedSeatCountForClass: () => 0, getRecoveryDatesForClass: () => ['2026-11-17'], selectedRecoveryTicket: {}, fixedSeatClasses: [], getClassRefPath: row => row.refPath, myClasses: [], getClassDocumentId: clase => clase.id };
    const result = vm.runInNewContext(`(() => {${studentSource.slice(start, end)}; return availableClasses;})()`, context);
    assert.deepEqual(plain(result.map(row => row.id)), ['c5', 'c3', 'c2', 'c1', 'c4', 'c0'], type);
  }
});

test('se excluye solo la plaza propia por ruta, se conservan plazas públicas y no se confunden grupos homónimos', () => {
  const a = { ...futureClass, id: 'same', refPath: 'teachers/a/classes/same' };
  const b = { ...a, refPath: 'teachers/b/classes/same' };
  const payload = { classes: [{ ...publicRow(a), plazas: 2 }, { ...publicRow(b), plazas: 1 }] };
  const result = expansion.getPublicExpansionClasses(payload, [a, b], [a], today);
  assert.equal(result.length, 1); assert.equal(result[0].refPath, b.refPath); assert.equal(result[0].publicFreeSpots, 1);
  const unmapped = expansion.getPublicExpansionClasses(payload, [a], [], today);
  assert.equal(unmapped.length, 2); assert.equal(unmapped.find(row => row.publicSelectionId === publicRow(b).selectionId).publicMappingReady, false);
});

test('las plazas públicas mantienen fecha final inclusiva, formato heredado y exclusiones temporales', () => {
  for (const classEndDate of ['2026-11-03', '3/11/2026', '3-11-2026', '2026-11-3']) {
    assert.equal(expansion.isPublicExpansionSeat({ classEndDate }, {}, today), true);
    assert.equal(expansion.isPublicExpansionSeat({ classEndDate }, {}, '2026-11-04'), false);
  }
  assert.equal(expansion.isPublicExpansionSeat({ pendingStart: true }, {}, today), true);
  for (const entry of [{ isRecovery: true }, { type: 'temporary' }, { status: 'baja' }, { temporaryRelocationId: 'x' }]) assert.equal(expansion.isPublicExpansionSeat(entry, {}, today), false);
  assert.equal(expansion.isPublicExpansionSeat({}, { globalStatus: 'baja' }, today), false);
});

test('una reserva en formación no activa fecha, cuota ni asistencia y conserva las otras clases del alumno', async () => {
  const run = adminSetup({ formation: true, tadosi: false });
  const result = await run.execute(); assert.equal(result.ok, true, result.message);
  const entry = run.store.get('classes/future').students[0];
  assert.equal(entry.pendingStart, true); assert.equal(entry.classStartDate, ''); assert.equal(entry.expansionAwaitingStart, true);
  const student = run.store.get('artifacts/demo/students/s');
  assert.equal(student.classStartDate, '2025-01-01'); assert.equal(student.globalStatus, 'activo'); assert.deepEqual(student.pendingStartClassIds, ['future']);
  assert.equal(run.store.get('artifacts/demo/gestiones/g').requestedStartPending, true);
  assert.equal(run.prompts.length, 0); assert.equal(run.sent.length, 2); assert.match(run.sent[1].body, /todavía no debes acudir ni se activará la nueva cuota/);
});

test('la aprobación rechaza una publicación retirada o agotada después de abrir la solicitud', async () => {
  for (const classes of [[], [{ ...publicRow(futureClass), plazas: 0 }]]) {
    const run = adminSetup({ changedPublication: { classes } }), before = JSON.stringify([...run.store]);
    assert.equal((await run.execute()).ok, false); assert.equal(JSON.stringify([...run.store]), before); assert.equal(run.sent.length, 0);
  }
});

test('confirmar inicio de una ampliación en formación activa la plaza y crea la gestión de cuota sin reenviar bienvenida', async () => {
  const entry = { id: 's', pendingStart: true, expansionAwaitingStart: true, sourceGestionId: 'g', email: 'student@example.com' };
  const c = { ...futureClass, autoAdvanceStartDate: false, students: [entry] };
  const writes = [], sent = [], alerts = [];
  const context = { ...expansion, c, todayStr: today, db: {}, appId: 'demo', user: { email: 'admin@example.com' },
    students: [{ id: 's', name: 'Alumno', email: entry.email, classStartDate: '2025-01-01', pendingStartClassIds: ['future', 'other'] }],
    isPendingClassStartEntry: entry => entry.pendingStart === true, normalizeStudentClassStartDate: value => value, getClassStartDateWarning: () => '',
    window: { prompt: () => '2026-11-17', confirm: () => true }, alert: message => alerts.push(message), setSaving: () => {},
    doc: (_db, ...path) => path.join('/'), getDoc: async () => ({ exists: () => true }),
    writeBatch: () => ({ update: (path, data) => writes.push(['update', path, plain(data)]), set: (path, data) => writes.push(['set', path, plain(data)]), commit: async () => {} }),
    updateDoc: async () => assert.fail('No debe sobrescribir los indicadores de bienvenida de un alumno existente'),
    withClassStudentIndex: students => ({ students }), getFormationActivationPatch: () => ({}), formatClassLine: () => 'Guitarra martes 18:00', formatDateSpanish: value => value,
    buildNewFixedStudentTeacherEmailBody: () => 'Inicio confirmado', sendTeacherNotification: async data => sent.push(data), sendStudentNotification: async data => { sent.push(data); return true; } };
  const confirm = evaluate(adminSource, findDeclaration(adminAst, 'confirmPendingStudentStart'), context);
  await confirm({ id: 's', displayName: 'Alumno' });
  const updated = writes.find(row => row[1] === c.refPath)[2].students[0];
  assert.equal(updated.pendingStart, false); assert.equal(updated.expansionAwaitingStart, false); assert.equal(updated.classStartDate, '2026-11-17'); assert.equal(updated.scheduledStartDate, '2026-11-17');
  const studentPatch = writes.find(row => row[1] === 'artifacts/demo/students/s')[2];
  assert.equal(studentPatch.classStartDate, undefined); assert.deepEqual(studentPatch.pendingStartClassIds, ['other']);
  const quota = writes.find(row => row[0] === 'set');
  assert.equal(quota[1], 'artifacts/demo/gestiones/cuota-ampliacion-g'); assert.equal(quota[2].type, 'ajuste_cuota_apertura_grupo'); assert.equal(quota[2].status, 'pendiente');
  assert.equal(sent.length, 2); assert.match(sent[1].subject, /ampliación/); assert.match(sent[1].body, /2026-11-17/);
  c.autoAdvanceStartDate = true; writes.length = 0; sent.length = 0;
  await confirm({ id: 's', displayName: 'Alumno' });
  assert.equal(writes.length, 0); assert.equal(sent.length, 0); assert.match(alerts.at(-1), /sigue en formación/);
});
