import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import { matchesBoardView } from '../src/components/announcementAudienceUtils.js';

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
