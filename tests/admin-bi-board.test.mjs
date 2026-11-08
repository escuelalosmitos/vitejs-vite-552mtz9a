import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import { matchesBoardView } from '../src/components/announcementAudienceUtils.js';
import { buildPublicClassSelectionId, getExpansionStartDate, isExpansionDate } from '../src/components/classExpansionUtils.js';

const source = await readFile('src/components/AdminPortal.jsx', 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
const declarations = new Map();
const walk = value => {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'VariableDeclarator' && value.id.type === 'Identifier') declarations.set(value.id.name, value.init);
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'range') Array.isArray(child) ? child.forEach(walk) : walk(child);
  }
};
walk(ast);
// Read the real portal calculations rather than maintaining a test implementation.
const evaluate = (name, context) => vm.runInNewContext(`(${source.slice(...declarations.get(name).range)})`, context);
const teachers = {};
for (const name of ['cleanTeacherDisplayName', 'normalizeTeacherKey', 'isSameTeacher', 'getAttendanceRecordVersion', 'dedupeAttendanceRecords']) {
  // teachersPayroll has a separate local normalizer; use the portal-level declaration.
  const declaration = ast.body.flatMap(node => node.declarations || []).find(node => node.id.name === name);
  assert.ok(declaration, name);
  teachers[name] = vm.runInNewContext(`(${source.slice(...declaration.init.range)})`, teachers);
}
const calculate = (records, rate = 23.84) => evaluate('currentMonthAvoidedCompanyCost', {
  useMemo: callback => callback(),
  uniqueAttendanceRecords: teachers.dedupeAttendanceRecords(records),
  currentMonthStartStr: '2026-11-01', settings: { costeEmpresa: rate }, ...teachers
});

test('BI excluye horas, importe y motivos de Paco sin perder registros de otros docentes', () => {
  const result = calculate([
    { classId: 'p1', date: '2026-11-02', teacher: 'Paco', isRenounced: true, duration: 60 },
    { classId: 'p2', date: '2026-11-03', teacher: '  PÁCO  ', isNonComputable: true, duration: 90, nonComputableReason: 'solo_paco' },
    { classId: 's1', date: '2026-11-02', teacher: 'Sara', isNonComputable: true, duration: 60, nonComputableReason: 'sin_alumnos' },
    { classId: 's1', date: '2026-11-02', teacher: 'Sara', isNonComputable: true, duration: 45, nonComputableReason: 'sin_alumnos', savedAt: '2026-11-02T20:00:00Z' },
    { classId: 's2', date: '2026-11-03', teacher: 'Laura', isRenounced: true, isNonComputable: true, duration: '90,0' },
    { classId: 's3', date: '2026-11-04', teacher: 'Sara', duration: 60 },
    { classId: 's4', date: '2026-10-31', teacher: 'Sara', isRenounced: true, duration: 60 }
  ]);
  assert.equal(result.records, 2);
  assert.equal(result.hours, 2.25);
  assert.equal(result.amount, 2.25 * 23.84);
  assert.equal(result.byReason.solo_paco, undefined);
  assert.equal(result.byReason.sin_alumnos, 1);
  assert.equal(result.byReason.sin_motivo, 1);
});

test('BI muestra cero si solo hay horas de Paco y conserva el coste por hora configurado', () => {
  const onlyPaco = calculate([{ classId: 'p1', date: '2026-11-02', teacher: 'paco', isRenounced: true, duration: 60 }]);
  assert.equal(onlyPaco.hours, 0); assert.equal(onlyPaco.amount, 0); assert.equal(onlyPaco.records, 0);
  const records = [{ classId: 's1', date: '2026-11-02', teacher: 'Sara', isRenounced: true, duration: 30 }];
  assert.equal(calculate(records, 30).amount, 15);
  assert.equal(calculate(records, 0).amount, 0);
});

test('los cinco filtros de tipo se cruzan con Vigentes, Historial y Con novedades', () => {
  const announcements = [
    { id: 'legacy' }, { id: 'notice', type: 'notice' },
    { id: 'poll', type: 'poll' }, { id: 'call', type: 'call' },
    { id: 'notice-old', type: 'notice', archived: true },
    { id: 'poll-old', type: 'poll', pollStatus: 'closed' },
    { id: 'call-old', type: 'call', callStatus: 'archived' }
  ];
  const trayNotifications = [
    { id: 'brief', type: 'tray_notice' },
    { id: 'brief-old', type: 'tray_notice', expiresAt: '2026-11-01T10:00' }
  ];
  const unreadBoardIds = new Set(['poll', 'call-old']);
  const expected = {
    current: { all: ['legacy', 'notice', 'poll', 'call', 'brief'], notice: ['legacy', 'notice'], poll: ['poll'], call: ['call'], tray_notice: ['brief'] },
    history: { all: ['notice-old', 'poll-old', 'call-old', 'brief-old'], notice: ['notice-old'], poll: ['poll-old'], call: ['call-old'], tray_notice: ['brief-old'] },
    unread: { all: ['poll', 'call-old'], notice: [], poll: ['poll'], call: ['call-old'], tray_notice: [] }
  };
  const before = JSON.stringify({ announcements, trayNotifications });
  for (const [boardView, filters] of Object.entries(expected)) {
    for (const [boardTypeFilter, ids] of Object.entries(filters)) {
      const context = { announcements, trayNotifications, boardView, boardTypeFilter, unreadBoardIds, matchesBoardView, pollClock: Date.parse('2026-11-02T12:00:00Z') };
      const actual = [...evaluate('boardAnnouncements', context), ...evaluate('boardTrayNotifications', context)];
      assert.deepEqual(actual.map(item => item.id), ids, `${boardView} / ${boardTypeFilter}`);
    }
  }
  assert.equal(JSON.stringify({ announcements, trayNotifications }), before);
  assert.deepEqual([...unreadBoardIds], ['poll', 'call-old']);
});

test('Redes distingue plazas iniciadas y aperturas futuras con texto limpio y fecha de primera sesión', () => {
  const todayStr = '2026-11-08';
  const clase = (path, subject, dayOfWeek, time, students = []) => ({
    id: 'same-id', refPath: `artifacts/app/users/${path}/recurringClasses/same-id`,
    sede: 'Reus', subject, dayOfWeek, time, capacity: 4, students
  });
  const active = clase('active', 'Guitarra', 1, '18:00', [{ id: 'active' }]);
  const another = clase('another', 'Guitarra', 0, '09:30', [{ id: 'active' }]);
  const recovery = clase('recovery', 'Batería', 3, '19:00', [{ id: 'active', isRecovery: true }]);
  const future = clase('future', 'Canto', 5, '17:00');
  const pending = clase('pending', 'Bajo', 2, '16:00', [{ id: 'active', pendingStart: true }]);
  const maintenance = clase('maintenance', 'Violín', 4, '18:00', [{ id: 'maintenance' }]);
  const futureStudent = clase('student-future', 'Teclado', 2, '18:00', [{ id: 'active', classStartDate: '2026-12-01' }]);
  const noOpening = clase('no-opening', 'Sin fecha', 2, '18:00');
  const pastOpening = clase('past-opening', 'Inicio vencido', 2, '18:00');
  const hidden = clase('hidden', 'No publicado', 2, '18:00', [{ id: 'active' }]);
  const full = clase('full', 'Completo', 2, '18:00', [{ id: 'active' }]);
  const inactiveCenter = { ...active, refPath: 'inactive', sede: 'Cerrada', subject: 'Sede cerrada' };
  const all = [another, future, recovery, pending, maintenance, futureStudent, noOpening, pastOpening, active, hidden, full, inactiveCenter];
  const offer = (c, inicio = null) => ({ selectionId: buildPublicClassSelectionId(c.refPath), escuela: c.sede,
    instrumento: c.subject, dayNum: c.dayOfWeek, timeStr: c.time, plazas: 2, inicio });
  const offers = [offer(another), offer(active), offer(recovery, '2026-12-01'), offer(future, '2026-12-01'),
    { ...offer(pending, '2026-12-01'), autoAdvanceStartDate: true }, offer(maintenance, '2026-12-01'),
    offer(futureStudent, '2026-12-01'), offer(noOpening), offer(pastOpening, '2026-10-01'), offer(inactiveCenter)];
  const context = { todayStr, students: [], recurringClassesOnly: all, publicAvailabilityPublication: { classes: offers },
    activeCenterNames: ['Reus'], isSameCenter: (a, b) => a === b, buildPublicClassSelectionId, isExpansionDate, getExpansionStartDate,
    isStudentInMaintenance: id => id === 'maintenance',
    getDayName: day => ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][day],
    formatDateSpanish: date => date,
    setSocialListMode: mode => { context.mode = mode; }, setSocialModalText: text => { context.text = text; }
  };
  for (const name of ['isFixedClassStudent', 'normalizeStudentClassStartDate', 'normalizeStudentClassEndDate',
    'getStudentClassStartDate', 'getStudentClassEndDate', 'hasStudentClassEndedBeforeDate', 'isPendingClassStartEntry', 'getCommercialSeatDataForClass']) {
    context[name] = evaluate(name, context);
  }
  const generate = evaluate('handleGenerateSocialText', context);
  generate();
  assert.equal(context.mode, 'started');
  assert.equal(context.text, 'SEDE REUS\n\nGUITARRA\nLunes 18h\nDomingo 9:30h');

  generate('future');
  const futureText = context.text;
  for (const instrument of ['CANTO', 'BAJO', 'BATERÍA', 'VIOLÍN', 'TECLADO']) assert.ok(futureText.includes(instrument));
  assert.match(futureText, /Viernes 17h · Inicio 2026-12-04/);
  assert.match(futureText, /Miércoles 19h · Inicio 2026-12-02/);
  assert.doesNotMatch(futureText, /GUITARRA/);

  generate('both');
  assert.match(context.text, /GUITARRA/);
  assert.match(context.text, /CANTO/);
  assert.doesNotMatch(context.text, /SIN FECHA|INICIO VENCIDO|NO PUBLICADO|COMPLETO|SEDE CERRADA|\*|🔹|iniciad|hibernad|formación|Última plaza/i);
  assert.equal(all.length, 12);
  context.publicAvailabilityPublication = { classes: [] };
  generate('future');
  assert.equal(context.mode, 'future');
  assert.equal(context.text, '');
});
