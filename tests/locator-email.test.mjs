import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import * as mail from '../src/components/locatorEmailUtils.js';

const source = await readFile('src/components/AdminPortal.jsx', 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
const variables = new Map();
const walk = node => { if (!node || typeof node !== 'object') return; if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') variables.set(node.id.name, node.init); for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value); };
walk(ast);
const fn = (name, context) => vm.runInNewContext(`(${source.slice(...variables.get(name).range)})`, context);
const dayName = () => 'martes', centerName = c => c.sede || (c.centerId === 'reus' ? 'Reus' : 'Tarragona');
const origin = { id: 'origin', refPath: 'artifacts/app/users/teacher/recurringClasses/origin', subject: 'Guitarra', dayOfWeek: 2, time: '18:00', sede: 'Reus', teacher: 'Paco', duration: 60, cuotaBase: 70, capacity: 4 };
const alternative = { ...origin, id: 'alternative', time: '19:00', refPath: 'artifacts/app/users/teacher/recurringClasses/alternative' };

test('turnos imprimen solo instrumento, día, hora, sede y cuota; validación interna mantiene profesor y duración', () => {
  const line = mail.formatLocatorTurn(origin, dayName, centerName);
  assert.equal(line, 'Guitarra · martes 18:00h · Reus · 70 €/mes');
  assert.doesNotMatch(line, /Paco|60 min|plaza/);
  assert.notEqual(mail.locatorClassSignature(origin), mail.locatorClassSignature({ ...origin, teacher: 'Sara' }));
  assert.notEqual(mail.locatorClassSignature(origin), mail.locatorClassSignature({ ...origin, duration: 45 }));
  assert.equal(mail.locatorClassSignature(origin, centerName), mail.locatorClassSignature({ ...origin, centerId: 'reus' }, centerName));
  assert.doesNotMatch(source.match(/locatorAlternatives\(locatorEmail.item\)\.map[\s\S]*?<\/label>/)[0], /getCommercialFreeSpots|plaza\(s\)/);
});

test('solicitud usa el tipo de correo general con categoría específica y remitente Gestiones', () => {
  assert.deepEqual(mail.buildLocatorEmailPayload({ to: 'ana@example.com', subject: 'Opciones', body: 'Texto', requestId: 'abcdefghijklmnopqrst' }), {
    type: 'notificacion_email', category: 'contacto_localizador', to: 'ana@example.com', subject: 'Opciones', body: 'Texto', requestId: 'abcdefghijklmnopqrst', from: 'gestiones@escuelalosmitos.com', replyTo: 'gestiones@escuelalosmitos.com'
  });
});

test('la revisión de plazas ignora actividad del trivial, fotos y lecturas, y conserva bajas y fechas', () => {
  const student = { id: 's1', email: 'ana@example.com', globalStatus: 'activo', classStartDate: '2026-01-01', triviaPoints: 10, lastSeenTablon: 'ayer', avatarPath: 'old' };
  const changed = { ...student, triviaPoints: 100, triviaLastPlayed: '2026-10-28', lastSeenTablon: 'hoy', avatarPath: 'new', avatarUpdatedAt: 'hoy', authUid: 'uid', claimed: true };
  assert.deepEqual(mail.locatorStudentPlanningData(student), mail.locatorStudentPlanningData(changed));
  assert.notDeepEqual(mail.locatorStudentPlanningData(student), mail.locatorStudentPlanningData({ ...student, globalStatus: 'baja' }));
  assert.notDeepEqual(mail.locatorStudentPlanningData(student), mail.locatorStudentPlanningData({ ...student, classStartDate: '2026-12-01' }));
});

const makeSender = (options = {}) => {
  const student = { id: 's1', name: 'Ana', email: 'ana@example.com', globalStatus: 'activo', triviaPoints: 1 };
  const item = { row: origin, studentId: 's1', email: student.email, reason: 'En espera de apertura' };
  const requests = [], writes = [], alerts = [];
  const documents = new Map([[origin.refPath, options.origin || origin], [alternative.refPath, options.alternative || alternative], ['artifacts/app/students/s1', student]]);
  const doc = (_db, ...parts) => {
    if (!parts.length && _db?.path) return { path: `${_db.path}/abcdefghijklmnopqrst`, id: 'abcdefghijklmnopqrst' };
    return { path: parts.join('/'), id: parts.at(-1) };
  };
  const context = { ...mail, db: {}, appId: 'app', user: { email: 'admin@example.com' }, students: [student], maintenancePeriods: [], temporaryRelocations: [],
    locatorEmail: { item, selected: ['alternative'], subject: 'Opciones', body: 'Texto' }, locatorSendingRef: { current: false }, dangerViewMode: 'actual',
    getDayName: dayName, normalizeEmail: value => String(value || '').trim().toLowerCase(), getClassCenterName: centerName, getOfficialTeacherName: value => value,
    locatorAlternatives: () => [alternative], locatorAlternativeEligible: value => value.capacity > 1,
    getClassStudentPlanningData: () => [{ id: 's1', isPendingStart: true }], locatorContactId: () => 'origin|s1',
    collection: (_db, ...parts) => ({ path: parts.join('/') }), doc,
    getDocsFromServer: async ref => ({ docs: ref.path.endsWith('/students') ? [{ id: 's1', data: () => ({ ...student, triviaPoints: 30, lastSeenTablon: 'hoy' }) }] : [] }),
    getDocFromServer: async ref => ({ exists: () => documents.has(ref.path), data: () => documents.get(ref.path), id: ref.id, ref }),
    setDoc: async (ref, value) => writes.push([ref, value]), updateDoc: async (ref, value) => writes.push([ref, value]),
    sendNotificationEmail: async payload => { requests.push(payload); return options.fail ? false : true; },
    writeBatch: () => ({ update() {}, set() {}, commit: async () => {} }),
    alert: text => alerts.push(text), setLocatorSending() {}, setLocatorEmail: value => { context.locatorEmail = value; }
  };
  context.locatorClassLine = fn('locatorClassLine', context);
  const send = fn('sendLocatorEmail', context);
  return { send, context, requests, writes, alerts };
};

test('manejador real prepara y solicita correo aunque el alumno haya jugado o leído un aviso durante la revisión', async () => {
  const sender = makeSender(); await sender.send();
  assert.equal(sender.requests.length, 1); assert.equal(sender.requests[0].type, 'notificacion_email'); assert.equal(sender.requests[0].category, 'contacto_localizador');
  assert.equal(sender.context.locatorEmail, null); assert.equal(sender.context.locatorSendingRef.current, false);
  assert.match(sender.alerts[0], /Envío solicitado/);
});

test('cambios de profesor, duración o datos de turno siguen bloqueando envíos desactualizados', async () => {
  for (const patch of [{ teacher: 'Sara' }, { duration: 45 }, { cuotaBase: 85 }, { time: '20:00' }]) {
    const sender = makeSender({ alternative: { ...alternative, ...patch } }); await sender.send();
    assert.equal(sender.requests.length, 0); assert.match(sender.alerts[0], /Han cambiado/);
  }
});

test('error de solicitud no marca envío solicitado y permite revisar sin ocultar el fallo', async () => {
  const sender = makeSender({ fail: true }); await sender.send();
  assert.equal(sender.requests.length, 1); assert.equal(sender.context.locatorSendingRef.current, false);
  assert.equal(sender.writes.at(-1)[1].status, 'error_solicitud'); assert.ok(sender.context.locatorEmail); assert.match(sender.alerts[0], /No se pudo solicitar/);
});
