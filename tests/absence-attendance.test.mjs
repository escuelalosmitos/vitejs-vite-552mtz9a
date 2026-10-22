import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { retainGestionForAttendance, getMatchingAbsenceGestiones, getRelatedAbsenceTickets, getAbsenceAttendanceUpdate, findRecordedPresentAbsence } from '../src/components/absenceAttendanceUtils.js';
import { reconcileAttendedAbsence } from '../src/components/absenceAttendanceReconciliation.js';

const user = { uid: 'elia-uid', email: 'elia@escuelalosmitos.com' };
const appId = 'default-app-id';
const root = `artifacts/${appId}`;
const notice = { id: 'aviso-noa', type: 'aviso_ausencia', studentId: 'noa-id', studentName: 'JUDITH', studentEmail: 'madre@example.com', requestedClass: 'guitarra-18', absenceDate: '2026-10-09', status: 'pendiente', wantsRecovery: true, ticketOutcome: 'awaiting_attendance', teacherEmails: [user.email] };
const record = { id: 'record-9', date: '2026-10-09', classId: 'guitarra-18', subject: 'Guitarra', teacher: 'Elia', time: '18:00', students: [{ id: 'noa-id', name: 'NOA', status: 'present' }] };
const ticket = { id: 'ticket-noa', studentId: 'noa-id', studentEmail: notice.studentEmail, subject: 'Guitarra', originalDate: record.date, originalClassId: record.classId, absenceGestionId: notice.id, isUsed: false };

for (const status of ['pendiente', 'completado', 'archivado']) {
  test(`un aviso ${status} sigue vinculado al guardar Asistió y conserva su cierre informativo`, () => {
    const gestion = { ...notice, status };
    const loaded = [gestion].filter(item => retainGestionForAttendance(item, record.date));
    assert.equal(getMatchingAbsenceGestiones(loaded, 'noa-id', record, record.date).length, 1);
    const update = getAbsenceAttendanceUpdate(gestion, { ticketOutcome: 'attended' }, 'ahora');
    assert.equal(update.ticketOutcome, 'attended');
    assert.equal(update.status, status === 'pendiente' ? 'completado' : status);
    assert.equal(loaded.filter(item => item.status === 'pendiente').length, status === 'pendiente' ? 1 : 0);
  });
}

test('se resuelven varios avisos coincidentes sin mezclar alumno, fecha ni clase', () => {
  const other = [
    { ...notice, id: 'otro-alumno', studentId: 'otra-id' },
    { ...notice, id: 'otro-dia', absenceDate: '2026-10-02' },
    { ...notice, id: 'otra-clase', requestedClass: 'guitarra-19' }
  ];
  assert.deepEqual(getMatchingAbsenceGestiones([notice, { ...notice, id: 'duplicado', status: 'archivado' }, ...other], 'noa-id', record, record.date).map(item => item.id), [notice.id, 'duplicado']);
});

test('un aviso antiguo sin absenceDate se vincula por fecha, asignatura y turno', () => {
  const legacy = { ...notice, requestedClass: '', absenceDate: '', title: 'Falta a clase: Guitarra', details: 'El alumno no asistirá el 09/10/2026 a las 18:00h. (Aviso en plazo)' };
  assert.equal(getMatchingAbsenceGestiones([legacy], notice.studentId, record, record.date).length, 1);
  assert.equal(getMatchingAbsenceGestiones([legacy], notice.studentId, { ...record, time: '19:00' }, record.date).length, 0);
  assert.equal(getMatchingAbsenceGestiones([legacy], notice.studentId, { ...record, subject: 'Canto' }, record.date).length, 0);
});

test('no se deduce asistencia por el nombre del titular ni por otra sesión o una recuperación', () => {
  assert.equal(findRecordedPresentAbsence(notice, [record]), record);
  for (const changed of [
    { ...record, date: '2026-10-02' },
    { ...record, students: [{ id: 'otro-id', name: 'JUDITH', status: 'present' }] },
    { ...record, students: [{ id: notice.studentId, status: 'notified' }] },
    { ...record, students: [{ id: notice.studentId, status: 'present', isRecovery: true }] },
    { ...record, nonComputableReason: 'last_minute_class_not_taught' }
  ]) assert.equal(findRecordedPresentAbsence(notice, [changed]), null);
});

test('los tickets de regalo, de otra fecha, clase o alumno quedan fuera de la resolución', () => {
  const unrelated = [
    { ...ticket, id: 'gift', isGift: true },
    { ...ticket, id: 'any', subjectScope: 'any' },
    { ...ticket, id: 'other-student', studentId: 'otra-id' },
    { ...ticket, id: 'other-date', absenceGestionId: '', originalDate: '2026-10-02' },
    { ...ticket, id: 'other-class', absenceGestionId: '', originalClassId: 'guitarra-19' }
  ];
  assert.deepEqual(getRelatedAbsenceTickets([ticket, ...unrelated], [notice], notice.studentId, record, record.date).map(item => item.id), [ticket.id]);
});

function memoryApi({ gestion = notice, attendance = record, ticketList = [], failCommit = false } = {}) {
  const docs = new Map();
  const ref = path => ({ path, id: path.split('/').at(-1) });
  const snap = path => ({ ref: ref(path), id: ref(path).id, exists: () => docs.has(path), data: () => structuredClone(docs.get(path)) });
  const gestionPath = `${root}/gestiones/${notice.id}`;
  const recordPath = `${root}/users/${user.uid}/records/${record.id}`;
  docs.set(gestionPath, structuredClone(gestion));
  docs.set(recordPath, structuredClone(attendance));
  for (const item of ticketList) docs.set(`${root}/users/${user.uid}/tickets/${item.id}`, structuredClone(item));
  const writes = [];
  const api = {
    doc: (_db, ...parts) => ref(parts.join('/')), collectionGroup: () => ({}), where: () => ({}), query: () => ({}),
    getDocs: async () => ({ docs: [...docs.keys()].filter(path => path.includes('/tickets/')).map(snap) }),
    runTransaction: async (_db, callback) => {
      const pending = [];
      let writing = false;
      const result = await callback({
        get: async reference => { assert.equal(writing, false, 'todas las lecturas preceden a las escrituras'); return snap(reference.path); },
        set: (reference, data) => { writing = true; pending.push({ path: reference.path, data }); }
      });
      if (failCommit) throw new Error('commit denied');
      for (const item of pending) docs.set(item.path, { ...docs.get(item.path), ...item.data });
      writes.push(...pending);
      return result;
    }
  };
  return { docs, writes, api, gestionPath, recordPath };
}
const repair = model => reconcileAttendedAbsence({ db: {}, appId, user, gestion: notice, record }, model.api);

test('repara el aviso histórico archivado, sin generar ticket ni repetir escrituras', async () => {
  const model = memoryApi({ gestion: { ...notice, status: 'archivado' } });
  assert.equal(await repair(model), true);
  assert.equal(model.docs.get(model.gestionPath).ticketOutcome, 'attended');
  assert.equal(model.docs.get(model.gestionPath).status, 'archivado');
  assert.equal(model.docs.size, 2);
  assert.equal(await repair(model), false);
  assert.equal(model.writes.length, 1);
});

test('anula un ticket histórico no usado y conserva la prueba de asistencia', async () => {
  const model = memoryApi({ ticketList: [ticket] });
  await repair(model);
  const updated = model.docs.get(`${root}/users/${user.uid}/tickets/${ticket.id}`);
  assert.equal(updated.voided, true);
  assert.equal(updated.voidReason, 'attendance_confirmed');
  assert.equal(updated.attendanceRecordId, record.id);
  assert.deepEqual(model.docs.get(model.recordPath).presentStudentIds, [notice.studentId]);
});

test('un ticket ya consumido abre incidencia y no se anula ni se borra', async () => {
  const model = memoryApi({ ticketList: [{ ...ticket, isUsed: true }] });
  await repair(model);
  assert.equal(model.docs.get(model.gestionPath).ticketOutcome, 'attended_ticket_already_used');
  assert.equal(model.docs.get(`${root}/users/${user.uid}/tickets/${ticket.id}`).voided, undefined);
  assert.equal(model.docs.get(`${root}/gestiones/attendance-reconciliation-${notice.id}`).status, 'pendiente');
});

test('relee la asistencia y no repara si ya cambió a ausencia', async () => {
  const model = memoryApi({ attendance: { ...record, students: [{ id: notice.studentId, status: 'absent' }] } });
  assert.equal(await repair(model), false);
  assert.equal(model.writes.length, 0);
});

test('un fallo de permisos no deja una resolución parcial', async () => {
  const model = memoryApi({ ticketList: [ticket], failCommit: true });
  await assert.rejects(repair(model), /commit denied/);
  assert.equal(model.docs.get(model.gestionPath).ticketOutcome, 'awaiting_attendance');
  assert.equal(model.docs.get(`${root}/users/${user.uid}/tickets/${ticket.id}`).voided, undefined);
});

test('la tarjeta semanal cambia después del inicio, no al terminar la clase', async () => {
  const source = await readFile('src/components/StudentPortal.jsx', 'utf8');
  const expression = source.match(/const getNextClassScheduleInfo = ([\s\S]*?);\n\n  const getClassReferenceDateForStudent/)[1];
  for (const [instant, expected] of [
    ['2026-10-02T17:59:00', '2026-10-02'], ['2026-10-02T18:00:00', '2026-10-02'],
    ['2026-10-02T18:00:01', '2026-10-09'], ['2026-10-02T18:30:00', '2026-10-09'],
    ['2026-10-02T19:01:00', '2026-10-09']
  ]) {
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } }
    const compute = vm.runInNewContext(`(${expression})`, {
      Date: Clock, isPunctualClass: () => false, getEffectiveClassForDate: item => item,
      formatLocalDateString: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    });
    assert.equal(compute({ dayOfWeek: 5, time: '18:00' }).dateStr, expected, instant);
  }
});
