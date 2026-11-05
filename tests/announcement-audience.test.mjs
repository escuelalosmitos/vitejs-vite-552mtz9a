import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as board from '../src/components/announcementAudienceUtils.js';

const selection = { targetType: 'filters', filters: { centers: ['Reus'], instruments: ['Guitarra'], teachers: ['Paco'], weekdays: [1, 2] } };
const lesson = { sede: 'Reus', subject: 'Guitarra', teacher: 'Paco', dayOfWeek: 1 };
const plain = value => JSON.parse(JSON.stringify(value));

test('los días funcionan como alternativas y las categorías se cruzan sobre la misma clase', () => {
  assert.equal(board.matchesBoardClass(lesson, selection), true);
  assert.equal(board.matchesBoardClass({ ...lesson, dayOfWeek: 2 }, selection), true);
  for (const change of [{ dayOfWeek: 3 }, { sede: 'Tarragona' }, { subject: 'Piano' }, { teacher: 'Sara' }]) assert.equal(board.matchesBoardClass({ ...lesson, ...change }, selection), false);
  const daysOnly = { targetType: 'filters', filters: { weekdays: [1, 3] } };
  assert.equal(board.matchesBoardClass({ ...lesson, subject: 'Piano', dayOfWeek: 3 }, daysOnly), true);
  assert.equal(board.matchesBoardClass({ ...lesson, dayOfWeek: 5 }, daysOnly), false);
});

test('los filtros vacíos o días inválidos no se convierten en todos los alumnos', () => {
  for (const weekdays of [[], ['', ' ', null, true, false, 7, -1, 1.5, 'lunes']]) {
    const options = { targetType: 'filters', filters: { weekdays } };
    assert.equal(board.validBoardAudience(options), false);
    assert.equal(board.matchesBoardClass(lesson, options), false);
  }
  assert.deepEqual(board.normalizeBoardFilters({ weekdays: ['0', 1, 1, '3'], centers: [' Reus ', 'Reus'] }), { centers: ['Reus'], instruments: [], teachers: [], weekdays: [0, 1, 3] });
  assert.equal(board.matchesBoardClass(lesson, { targetType: 'profesor', targetValue: '' }), false);
});

test('la firma de destinatarios es estable y conserva los segmentos anteriores', () => {
  assert.equal(board.boardAudienceSignature({ targetType: 'filters', filters: { weekdays: [3, 1] } }), board.boardAudienceSignature({ audienceType: 'filtered', audienceFilters: { weekdays: [1, 3] } }));
  for (const [targetType, targetValue] of [['all', ''], ['sede', 'Reus'], ['instrumento', 'Guitarra'], ['profesor', 'Paco']]) assert.equal(board.matchesBoardClass(lesson, { targetType, targetValue }), true);
  assert.equal(board.matchesBoardClass(lesson, { targetType: 'teachers' }), false);
  assert.match(board.boardFiltersLabel(selection), /Lunes o Martes/);
});

test('los destinatarios publicados se guardan por alumno sin exponer correos', () => {
  const fields = board.buildBoardAudienceFields(selection, [{ studentId: 'b', email: 'b@example.com' }, { studentId: 'a' }, { studentId: 'b' }]);
  assert.equal(fields.audienceType, 'filtered');
  assert.deepEqual(fields.recipientStudentIds, ['a', 'b']);
  assert.ok(!JSON.stringify(fields).includes('@'));
});

test('cada participación enciende sólo su publicación, incluyendo convocatorias antiguas', () => {
  const polls = [{ id: 'a', pollId: 'p1' }, { id: 'b', pollId: 'p2', adminSeenAt: 'seen' }];
  const calls = [{ id: 'c', callId: 'c1' }, { id: 'd', announcementId: 'c2' }];
  assert.deepEqual([...board.unreadBoardPublicationIds(polls, calls)], ['p1', 'c1', 'c2']);
  assert.deepEqual(board.getUnseenBoardResponses('p1', polls, calls).map(item => [item.id, item.collectionName]), [['a', 'pollResponses']]);
  assert.deepEqual(board.getUnseenBoardResponses('c2', polls, calls).map(item => item.id), ['d']);
});

test('caducar y archivar limpian Vigentes sin borrar el Historial ni las novedades', () => {
  const before = Date.parse('2026-10-26T08:59:59Z'), end = Date.parse('2026-10-26T09:00:00Z');
  const brief = { id: 'n', type: 'tray_notice', publishAt: '2026-10-25T10:00', expiresAt: '2026-10-26T10:00' };
  assert.equal(board.matchesBoardView(brief, 'current', new Set(), before), true);
  assert.equal(board.matchesBoardView(brief, 'current', new Set(), end), false);
  assert.equal(board.matchesBoardView(brief, 'history', new Set(), end), true);
  const call = { id: 'c', type: 'call', callStatus: 'closed' };
  assert.equal(board.matchesBoardView(call, 'history'), true);
  assert.equal(board.matchesBoardView(call, 'unread', new Set(['c'])), true);
  assert.equal(board.matchesBoardView({ type: 'notice', archived: true }, 'current'), false);
  assert.equal(board.boardPublicationState({ type: 'tray_notice', publishAt: '2099-01-01T10:00' }, end), 'scheduled');
});

test('restaurar conserva el estado anterior y no amplía fechas ni incluye listas privadas en las copias', () => {
  const poll = { type: 'poll', pollStatus: 'closed', pollDeadline: '2020-01-01T10:00' };
  const archived = { ...poll, ...board.boardArchiveFields(poll, true, 'now') };
  const restored = { ...archived, ...board.boardArchiveFields(archived, false, 'later') };
  assert.equal(archived.pollStatus, 'archived'); assert.equal(restored.pollStatus, 'closed');
  assert.equal(restored.pollDeadline, poll.pollDeadline);
  assert.equal(board.matchesBoardView(restored, 'history'), true);
  const inbox = board.buildBoardInboxItem('n', { title: 'Título', archived: true, recipientEmails: ['privado@example.com'], recipientStudentIds: ['a'] });
  assert.equal(inbox.archived, true); assert.equal(inbox.recipientEmails, undefined); assert.equal(inbox.recipientStudentIds, undefined);
});

const adminSource = await readFile('src/components/AdminPortal.jsx', 'utf8');
const adminAst = parse(adminSource, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
const nodes = new Map();
const walk = value => {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'VariableDeclarator' && value.id.type === 'Identifier' && ['ArrowFunctionExpression', 'FunctionExpression'].includes(value.init?.type)) nodes.set(value.id.name, value.init);
  for (const [key, child] of Object.entries(value)) if (key !== 'range') Array.isArray(child) ? child.forEach(walk) : walk(child);
};
walk(adminAst);
const loadFunction = (name, context) => { const node = nodes.get(name); assert.ok(node, name); return vm.runInNewContext(`(${adminSource.slice(...node.range)})`, context); };

const makeAdmin = ({ enabled = false, type = 'tray_notice', confirm = true } = {}) => {
  const writes = [], messages = [], emails = [];
  const students = ['a', 'b', 'd', 'cross', 'future', 'recovery'].map(id => ({ id, name: id, email: id === 'a' || id === 'd' ? 'familia@example.com' : `${id}@example.com`, globalStatus: 'activo' }));
  const classes = [
    { ...lesson, id: 'lunes', students: [{ id: 'a' }, { id: 'd' }, { id: 'recovery', isRecovery: true }] },
    { ...lesson, id: 'martes', dayOfWeek: 2, students: [{ id: 'b' }, { id: 'd' }, { id: 'future', classStartDate: '2099-01-01' }] },
    { ...lesson, id: 'guitarra-tarragona', sede: 'Tarragona', students: [{ id: 'cross' }] },
    { ...lesson, id: 'piano-reus', subject: 'Piano', students: [{ id: 'cross' }] }
  ];
  const state = {};
  const context = { ...board, students, recurringClassesOnly: classes, announcements: [], trayNotifications: [], pollResponses: [], callResponses: [],
    db: {}, appId: 'app', user: { email: 'admin@example.com', uid: 'admin' }, todayStr: '2026-10-26', pollClock: Date.parse('2026-10-26T09:00:00Z'),
    editingTrayNotificationId: null, editingAnnouncementId: null, boardResponseReadLocks: { current: new Set() },
    announceEmailOptions: { ...selection, enabled }, newAnnounce: { type, title: 'Aviso de prueba', content: 'Texto de prueba', trayPublishAt: '2026-10-26T10:00', trayExpiresAt: '2026-10-30T10:00' },
    normalizeEmail: email => String(email || '').trim().toLowerCase(), isSameCenter: (a, b) => a === b, isSameTeacher: (a, b) => a === b,
    getEffectiveClassForDate: value => value, getTodayLocalString: () => '2026-10-26', getLocalDateTimeInputValue: () => '2026-10-26T10:00',
    getAnnouncementTeacherTargets: () => [], normalizeAnnouncementUrl: url => url || '',
    ANNOUNCEMENT_EMAIL_TO: 'admin@example.test', ANNOUNCEMENT_EMAIL_BATCH_SIZE: 50,
    sendNotificationEmail: async payload => { emails.push(payload); return true; },
    alert: message => messages.push(message), window: { confirm: () => confirm },
    collection: (_db, ...parts) => ({ path: parts.join('/') }),
    doc: (first, ...parts) => parts.length ? { path: parts.join('/'), id: parts.at(-1) } : { path: `${first.path}/brief-1`, id: 'brief-1' },
    updateDoc: async (reference, value) => writes.push(['update', reference.path, value]),
    setDoc: async (reference, value) => writes.push(['set', reference.path, value]),
    writeBatch: () => ({ update: (ref, value) => writes.push(['update', ref.path, value]), set: (ref, value) => writes.push(['set', ref.path, value]), delete: ref => writes.push(['delete', ref.path]), commit: async () => {} }),
    getPollResponses: () => [], getCallResponses: () => [], createEmptyAnnouncementDraft: () => ({}),
    setNewAnnounce: value => { state.draft = value; }, setAnnounceEmailOptions: value => { state.options = value; },
    setEditingAnnouncementId: value => { state.edit = value; }, setEditingTrayNotificationId: value => { state.editTray = value; },
    cancelEditAnnouncement: () => { state.cancelled = true; }, setSelectedAnnouncementId: value => { state.selected = value; }
  };
  for (const name of ['normalizeStudentClassStartDate', 'normalizeStudentClassEndDate', 'getStudentClassStartDate', 'getStudentClassEndDate', 'isPendingClassStartEntry', 'hasStudentClassEndedBeforeDate', 'isStudentClassActiveOnDate', 'isFixedClassStudent', 'matchesAnnouncementTarget', 'getAnnouncementStudentTargets', 'getAnnouncementEmailTargets', 'getAnnouncementTargetLabel', 'buildAnnouncementEmailBody', 'sendAnnouncementEmailToTargets', 'postTrayNotification', 'postAnnouncement', 'setBoardPublicationArchived', 'markAnnouncementResponsesSeen']) context[name] = loadFunction(name, context);
  return { context, writes, messages, emails, state };
};

test('el selector real de Admin cruza la misma clase, omite recuperaciones y futuros, y deduplica familiares', () => {
  const app = makeAdmin();
  assert.deepEqual(plain(app.context.getAnnouncementStudentTargets().map(target => target.studentId)), ['a', 'b', 'd']);
  assert.deepEqual(plain(app.context.getAnnouncementEmailTargets().map(target => target.email)), ['b@example.com', 'familia@example.com']);
});

test('Notificación breve y Aviso comparten destinatarios y sólo solicitan correo si se marca la casilla', async () => {
  for (const type of ['tray_notice', 'notice']) for (const enabled of [false, true]) {
    const app = makeAdmin({ type, enabled });
    await app.context[type === 'tray_notice' ? 'postTrayNotification' : 'postAnnouncement']();
    const master = app.writes.find(([_action, path, data]) => path.includes(type === 'tray_notice' ? '/trayNotifications/' : '/announcements/') && data?.audienceType);
    assert.ok(master, app.messages.join(';'));
    assert.equal(master[2].audienceType, 'filtered');
    assert.deepEqual(plain(master[2].recipientStudentIds), ['a', 'b', 'd']);
    assert.equal(app.emails.length, enabled ? 1 : 0);
    if (enabled) assert.deepEqual(plain(app.emails[0].recipients), ['b@example.com', 'familia@example.com']);
    if (type === 'tray_notice') assert.equal(app.writes.filter(([_a, path]) => path.includes('/studentNotificationInbox/')).length, 2);
  }
});

test('archivar y restaurar una notificación actualizan las copias privadas sin enviar emails ni borrar participaciones', async () => {
  const app = makeAdmin();
  const notification = { id: 'n', type: 'tray_notice', title: 'Aviso', content: 'Texto', expiresAt: '2026-10-25T10:00', recipientEmails: ['familia@example.com', 'b@example.com', 'familia@example.com'] };
  await app.context.setBoardPublicationArchived(notification, true);
  assert.equal(app.writes.length, 3); assert.equal(app.writes[0][2].archived, true);
  assert.ok(app.writes.slice(1).every(([_a, _path, data]) => data.archived && data.recipientEmails === undefined));
  app.writes.length = 0;
  await app.context.setBoardPublicationArchived({ ...notification, archived: true }, false);
  assert.ok(app.writes.slice(1).every(([_a, _path, data]) => data.archived === false && data.expiresAt === notification.expiresAt));
  assert.equal(app.emails.length, 0);
  const cancelled = makeAdmin({ confirm: false }); await cancelled.context.setBoardPublicationArchived(notification, true); assert.equal(cancelled.writes.length, 0);
});

test('abrir resultados marca sólo esa publicación y no consume una respuesta que acaba de cambiar', async () => {
  const app = makeAdmin(), updates = [];
  app.context.pollResponses = [{ id: 'p1-a', pollId: 'p1', updatedAt: 'one' }, { id: 'p2-a', pollId: 'p2', updatedAt: 'one' }];
  app.context.callResponses = [{ id: 'c1-a', callId: 'c1', updatedAt: 'one' }];
  app.context.runTransaction = async (_db, callback) => callback({ get: async reference => ({ exists: () => true, data: () => ({ updatedAt: reference.id === 'p1-a' ? 'one' : 'two' }) }), update: (ref, data) => updates.push([ref.path, data]) });
  await app.context.markAnnouncementResponsesSeen('p1');
  assert.deepEqual(updates.map(([path]) => path), ['artifacts/app/pollResponses/p1-a']);
  updates.length = 0; await app.context.markAnnouncementResponsesSeen('c1'); assert.equal(updates.length, 0);
  assert.ok(!adminSource.includes("if (tabId === 'announcements') markAnnouncementResponsesSeen()"));
  assert.match(adminSource, /aria-label="Participaciones nuevas"/);
});

test('el portal del alumno limita los nuevos segmentos a su lista y oculta las publicaciones archivadas', async () => {
  const source = await readFile('src/components/StudentPortal.jsx', 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
  const component = ast.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
  const node = component.body.body.find(item => item.type === 'VariableDeclaration' && item.declarations[0].id.name === 'announcementMatchesStudent').declarations[0].init;
  const matches = vm.runInNewContext(`(${source.slice(...node.range)})`, { profile: { id: 'a' }, fixedMyClasses: [], isBoardPublicationArchived: board.isBoardPublicationArchived });
  assert.equal(matches({ audienceType: 'filtered', recipientStudentIds: ['a'] }), true);
  assert.equal(matches({ audienceType: 'filtered', recipientStudentIds: ['b'] }), false);
  assert.equal(matches({ audienceType: 'filtered', recipientStudentIds: ['a'], archived: true }), false);
  assert.equal(matches({ audienceType: 'teachers' }), false);
  assert.match(source, /where\('recipientStudentIds', 'array-contains', profile.id\)/);
  assert.match(source, /!notification.archived/);
});

test('los destinatarios de una encuesta o convocatoria con respuestas permanecen bloqueados al editar', async () => {
  for (const type of ['poll', 'call']) {
    const app = makeAdmin({ type, enabled: true });
    const existing = { id: 'old', type, ...board.buildBoardAudienceFields(selection, [{ studentId: 'a' }]), pollAnswerType: 'text', pollPrivacy: 'identified', pollOptions: [] };
    app.context.editingAnnouncementId = 'old'; app.context.announcements = [existing];
    app.context.newAnnounce = { ...app.context.newAnnounce, pollAnswerType: 'text', pollPrivacy: 'identified', pollOptions: [], pollDeadline: '2099-01-01T10:00', callDeadline: '2099-01-01T10:00' };
    app.context[type === 'poll' ? 'getPollResponses' : 'getCallResponses'] = () => [{ studentId: 'a' }];
    app.context.getPollParticipation = loadFunction('getPollParticipation', app.context);
    await app.context.postAnnouncement();
    assert.deepEqual(plain(app.writes.find(([_a, path, data]) => path.endsWith('/old') && data.audienceType)?.[2].recipientStudentIds), ['a']);
    assert.deepEqual(plain(app.emails[0].recipients), ['familia@example.com']);
    app.writes.length = 0; app.emails.length = 0;
    app.context.announceEmailOptions.filters = { ...selection.filters, weekdays: [3] };
    await app.context.postAnnouncement();
    assert.equal(app.writes.length, 0); assert.equal(app.emails.length, 0);
    assert.match(app.messages.at(-1), /No se pueden cambiar sus destinatarios/);
  }
});

test('una notificación que no se ha podido guardar no solicita correos', async () => {
  const app = makeAdmin({ enabled: true });
  const batch = app.context.writeBatch;
  app.context.writeBatch = () => ({ ...batch(), commit: async () => { throw new Error('Fallo de conexión'); } });
  await app.context.postTrayNotification();
  assert.equal(app.emails.length, 0); assert.match(app.messages.at(-1), /No se ha podido guardar/);
  assert.ok(!adminSource.includes("{newAnnounce.type !== 'tray_notice' && <label"));
});

test('el panel real muestra los siete días y permite combinar las cuatro categorías', async () => {
  const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
  try {
    const { default: Filters } = await server.ssrLoadModule('/src/components/AnnouncementAudienceFilters.jsx');
    const html = renderToStaticMarkup(createElement(Filters, { filters: { weekdays: [1, 3] }, centers: ['Reus'], instruments: ['Guitarra'], teachers: ['Paco'], onChange() {} }));
    assert.equal((html.match(/type="checkbox"/g) || []).length, 10);
    assert.equal((html.match(/checked=""/g) || []).length, 2);
    for (const value of ['Sede', 'Instrumento', 'Profesor', 'Día de la semana', 'Lunes', 'Miércoles', 'Domingo']) assert.ok(html.includes(value));
  } finally { await server.close(); }
});
