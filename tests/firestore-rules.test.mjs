import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';

const PROJECT_ID = 'demo-escuela-seguridad';
const APP_ID = 'default-app-id';
const ROOT = `artifacts/${APP_ID}`;

const ADMIN = {
  uid: 'admin-uid',
  email: 'paco@escuelalosmitos.com'
};
const TEACHER = {
  uid: 'teacher-uid',
  email: 'norman@escuelalosmitos.com'
};
const OTHER_TEACHER = {
  uid: 'other-teacher-uid',
  email: 'dago@escuelalosmitos.com'
};
const STUDENT = {
  uid: 'student-uid',
  id: 'student-1',
  email: 'student1@example.com'
};
const OTHER_STUDENT = {
  uid: 'student-2-uid',
  id: 'student-2',
  email: 'student2@example.com'
};

function authenticated(testEnv, identity) {
  return testEnv.authenticatedContext(identity.uid, {
    email: identity.email,
    email_verified: true
  }).firestore();
}

async function seed(testEnv) {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const documents = [
      ['publicData/classAvailability', { locations: ['Tarragona'] }],
      ['publicData/privateConfiguration', { secret: true }],

      [`${ROOT}/staffAccess/${TEACHER.email}`, {
        role: 'teacher',
        email: TEACHER.email,
        teacherNameLower: 'norman',
        teacherKey: 'norman',
        classOwnerIds: [TEACHER.uid]
      }],
      [`${ROOT}/staffAccess/${OTHER_TEACHER.email}`, {
        role: 'teacher',
        email: OTHER_TEACHER.email,
        teacherNameLower: 'dago',
        teacherKey: 'dago',
        classOwnerIds: [OTHER_TEACHER.uid]
      }],

      [`${ROOT}/students/${STUDENT.id}`, {
        name: 'Alumna Uno',
        email: STUDENT.email,
        claimed: true,
        authUid: STUDENT.uid,
        internalNotes: 'Dato privado'
      }],
      [`${ROOT}/students/${OTHER_STUDENT.id}`, {
        name: 'Alumno Dos',
        email: OTHER_STUDENT.email,
        claimed: true,
        authUid: OTHER_STUDENT.uid,
        internalNotes: 'Dato privado de otro alumno'
      }],
      [`${ROOT}/access/${STUDENT.uid}`, {
        role: 'student',
        studentId: STUDENT.id,
        email: STUDENT.email
      }],
      [`${ROOT}/access/${OTHER_STUDENT.uid}`, {
        role: 'student',
        studentId: OTHER_STUDENT.id,
        email: OTHER_STUDENT.email
      }],

      [`${ROOT}/settings/global`, { adminSecret: 'solo personal' }],
      [`${ROOT}/roleData/studentSettings`, { maintenanceFee: 15 }],
      [`${ROOT}/roleData/studentClassCatalog`, { classes: [{ id: 'class-own' }] }],
      [`${ROOT}/roleData/adminProjection`, { secret: 'solo admin' }],

      [`${ROOT}/announcements/announcement-all`, {
        title: 'Aviso general',
        audienceType: 'all',
        pollVoteCounts: {},
        pollResponseCount: 0
      }],
      [`${ROOT}/announcements/announcement-teachers`, {
        title: 'Aviso de profesores',
        audienceType: 'teachers'
      }],

      [`${ROOT}/gestiones/gestion-own`, {
        studentId: STUDENT.id,
        studentEmail: STUDENT.email,
        teacherKeys: ['norman'],
        teacherEmails: [TEACHER.email],
        status: 'pendiente'
      }],
      [`${ROOT}/gestiones/gestion-other`, {
        studentId: OTHER_STUDENT.id,
        studentEmail: OTHER_STUDENT.email,
        teacherKeys: ['dago'],
        teacherEmails: [OTHER_TEACHER.email],
        status: 'pendiente'
      }],
      [`${ROOT}/temporaryRelocations/relocation-own`, { studentId: STUDENT.id, studentEmail: STUDENT.email, teacherKeys: ['norman'], teacherEmails: [TEACHER.email] }],
      [`${ROOT}/temporaryRelocations/relocation-other`, { studentId: OTHER_STUDENT.id, studentEmail: OTHER_STUDENT.email, teacherKeys: ['dago'], teacherEmails: [OTHER_TEACHER.email] }],
      [`${ROOT}/temporaryRelocations/relocation-shared`, { studentId: STUDENT.id, studentEmail: STUDENT.email, teacherKeys: ['dago', 'norman'], teacherEmails: [OTHER_TEACHER.email, TEACHER.email] }],
      [`${ROOT}/maintenancePeriods/maintenance-own`, { studentId: STUDENT.id, studentEmail: STUDENT.email }],
      [`${ROOT}/temporaryClassChanges/change-private`, { teacherName: 'Norman', teacherKeys: ['norman'], teacherEmails: [TEACHER.email] }],
      [`${ROOT}/temporaryClassChanges/change-other`, { teacherName: 'Dago', teacherKeys: ['dago'], teacherEmails: [OTHER_TEACHER.email] }],
      [`${ROOT}/temporaryClassChanges/change-shared`, { teacherName: 'Dago', teacherKeys: ['dago', 'norman'], teacherEmails: [OTHER_TEACHER.email, TEACHER.email] }],

      [`${ROOT}/substitutions/substitution-cross`, {
        status: 'open',
        originalTeacherUid: OTHER_TEACHER.uid,
        originalTeacherName: 'Dago',
        date: '2026-09-01',
        subject: 'Guitarra'
      }],
      [`${ROOT}/substitutions/substitution-forged`, {
        status: 'open',
        originalTeacherUid: OTHER_TEACHER.uid,
        originalTeacherName: 'Dago',
        date: '2026-09-02',
        subject: 'Batería'
      }],
      [`${ROOT}/substitutions/substitution-own`, {
        status: 'open',
        originalTeacherUid: TEACHER.uid,
        originalTeacherName: 'Norman',
        date: '2026-09-03',
        subject: 'Piano'
      }],

      [`${ROOT}/workshops/workshop-1`, {
        title: 'Taller',
        confirmedCount: 0,
        pendingCount: 0,
        waitlistCount: 0
      }],
      [`${ROOT}/workshopRegistrations/workshop-1_${STUDENT.id}`, {
        workshopId: 'workshop-1',
        studentId: STUDENT.id,
        studentEmail: STUDENT.email,
        status: 'pending'
      }],
      [`${ROOT}/workshopRegistrations/workshop-1_${OTHER_STUDENT.id}`, {
        workshopId: 'workshop-1',
        studentId: OTHER_STUDENT.id,
        studentEmail: OTHER_STUDENT.email,
        status: 'pending'
      }],
      [`${ROOT}/pollResponses/poll-1_${STUDENT.id}`, {
        pollId: 'poll-1',
        studentId: STUDENT.id,
        studentEmail: STUDENT.email
      }],
      [`${ROOT}/pollResponses/poll-1_${OTHER_STUDENT.id}`, {
        pollId: 'poll-1',
        studentId: OTHER_STUDENT.id,
        studentEmail: OTHER_STUDENT.email
      }],
      [`${ROOT}/callResponses/call-1_${STUDENT.id}`, {
        callId: 'call-1',
        studentId: STUDENT.id,
        studentEmail: STUDENT.email
      }],
      [`${ROOT}/callResponses/call-1_${OTHER_STUDENT.id}`, {
        callId: 'call-1',
        studentId: OTHER_STUDENT.id,
        studentEmail: OTHER_STUDENT.email
      }],

      [`${ROOT}/teacherEvaluations/evaluation-own`, {
        studentId: STUDENT.id,
        studentEmail: STUDENT.email,
        classId: 'class-own',
        period: '2026-08'
      }],
      [`${ROOT}/teacherEvaluations/evaluation-other`, {
        studentId: OTHER_STUDENT.id,
        studentEmail: OTHER_STUDENT.email,
        classId: 'class-other',
        period: '2026-08'
      }],

      [`${ROOT}/teacherNotifications/notification-own`, {
        teacherUid: TEACHER.uid,
        teacherEmail: TEACHER.email,
        status: 'pending'
      }],
      [`${ROOT}/teacherNotifications/notification-other`, {
        teacherUid: OTHER_TEACHER.uid,
        teacherEmail: OTHER_TEACHER.email,
        status: 'pending'
      }],
      [`${ROOT}/teacherTasks/task-own`, {
        teacherUid: TEACHER.uid,
        teacherEmail: TEACHER.email,
        status: 'pending'
      }],
      [`${ROOT}/teacherTasks/task-other`, {
        teacherUid: OTHER_TEACHER.uid,
        teacherEmail: OTHER_TEACHER.email,
        status: 'pending'
      }],
      [`${ROOT}/availability/norman`, { slots: [] }],
      [`${ROOT}/availability/dago`, { slots: [] }],
      [`${ROOT}/payrollAdjustments/payroll-own`, { teacher: 'Norman', amount: 10 }],
      [`${ROOT}/payrollAdjustments/payroll-other`, { teacher: 'Dago', amount: 20 }],

      [`${ROOT}/users/${TEACHER.uid}`, { displayName: 'Norman' }],
      [`${ROOT}/users/${OTHER_TEACHER.uid}`, { displayName: 'Dago' }],
      [`${ROOT}/users/${TEACHER.uid}/records/record-own`, { date: '2026-08-30' }],
      [`${ROOT}/users/${OTHER_TEACHER.uid}/records/record-other`, { date: '2026-08-30' }],
      [`${ROOT}/users/${TEACHER.uid}/dailyReports/report-own`, { date: '2026-08-30' }],
      [`${ROOT}/users/${OTHER_TEACHER.uid}/dailyReports/report-other`, { date: '2026-08-30' }],
      [`${ROOT}/users/${TEACHER.uid}/recurringClasses/class-own`, {
        teacher: 'Norman',
        teacherName: 'Norman',
        authorizedTeacherKeys: ['norman'],
        authorizedTeacherEmails: [TEACHER.email],
        studentIds: [STUDENT.id],
        students: [{ id: STUDENT.id, name: 'Alumna Uno' }],
        exceptions: []
      }],
      [`${ROOT}/users/${OTHER_TEACHER.uid}/recurringClasses/class-other`, {
        teacher: 'Dago',
        teacherName: 'Dago',
        authorizedTeacherKeys: ['dago'],
        authorizedTeacherEmails: [OTHER_TEACHER.email],
        studentIds: [OTHER_STUDENT.id],
        students: [{ id: OTHER_STUDENT.id, name: 'Alumno Dos' }],
        exceptions: []
      }],
      [`${ROOT}/users/${OTHER_TEACHER.uid}/recurringClasses/class-temporary-shared`, {
        teacher: 'Dago',
        teacherName: 'Dago',
        authorizedTeacherKeys: ['dago', 'norman'],
        authorizedTeacherEmails: [OTHER_TEACHER.email, TEACHER.email],
        studentIds: [STUDENT.id],
        students: [{ id: STUDENT.id, name: 'Alumna Uno' }],
        exceptions: []
      }],
      [`${ROOT}/users/${TEACHER.uid}/tickets/ticket-own`, {
        studentId: STUDENT.id,
        studentEmail: STUDENT.email,
        subject: 'Guitarra',
        teacherKeys: ['norman'],
        recoveryTeacherKeys: [],
        teacherEmails: [TEACHER.email],
        recoveryTeacherEmails: [],
        status: 'pending'
      }],
      [`${ROOT}/users/${OTHER_TEACHER.uid}/tickets/ticket-other`, {
        studentId: OTHER_STUDENT.id,
        studentEmail: OTHER_STUDENT.email,
        subject: 'Batería',
        teacherKeys: ['dago'],
        recoveryTeacherKeys: [],
        teacherEmails: [OTHER_TEACHER.email],
        recoveryTeacherEmails: [],
        status: 'pending'
      }],
      [`${ROOT}/users/${OTHER_TEACHER.uid}/tickets/ticket-recovery-shared`, {
        studentId: STUDENT.id,
        studentEmail: STUDENT.email,
        subject: 'Guitarra',
        teacherKeys: ['dago'],
        recoveryTeacherKeys: ['norman'],
        teacherEmails: [OTHER_TEACHER.email],
        recoveryTeacherEmails: [TEACHER.email],
        isUsed: false,
        status: 'pending'
      }]
    ];

    await Promise.all(documents.map(([path, data]) => setDoc(doc(db, path), data)));
  });
}

test('las reglas aíslan visitante, alumno, profesor y administrador', async t => {
  const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(
    emulatorAddress,
    'Estas pruebas deben ejecutarse con "npm run test:rules" para arrancar el emulador.'
  );
  const separator = emulatorAddress.lastIndexOf(':');
  const host = emulatorAddress.slice(0, separator);
  const port = Number(emulatorAddress.slice(separator + 1));
  assert.ok(host && Number.isInteger(port), `Dirección de emulador no válida: ${emulatorAddress}`);

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: await readFile('firestore.rules', 'utf8')
    }
  });

  try {
    await testEnv.clearFirestore();
    await seed(testEnv);

    await t.test('visitante: solo puede leer classAvailability', async () => {
      const db = testEnv.unauthenticatedContext().firestore();

      await assertSucceeds(getDoc(doc(db, 'publicData/classAvailability')));
      await assertFails(getDoc(doc(db, 'publicData/privateConfiguration')));
      await assertFails(getDocs(collection(db, 'publicData')));
      await assertFails(setDoc(doc(db, 'publicData/classAvailability'), { tampered: true }));
      await assertFails(getDoc(doc(db, `${ROOT}/roleData/studentSettings`)));
    });

    await t.test('usuario autenticado sin rol: no obtiene acceso sensible', async () => {
      const db = authenticated(testEnv, {
        uid: 'unknown-uid',
        email: 'desconocido@escuelalosmitos.com'
      });

      await assertSucceeds(getDoc(doc(db, 'publicData/classAvailability')));
      await assertFails(getDoc(doc(db, `${ROOT}/students/${STUDENT.id}`)));
      await assertFails(getDoc(doc(db, `${ROOT}/settings/global`)));
      await assertFails(setDoc(doc(db, `${ROOT}/roleData/intrusion`), { admin: true }));
    });

    await t.test('alumno: inicia por su email, lee su ficha y no las ajenas', async () => {
      const db = authenticated(testEnv, STUDENT);
      const ownEmailQuery = query(
        collection(db, `${ROOT}/students`),
        where('email', '==', STUDENT.email)
      );

      await assertSucceeds(getDocs(ownEmailQuery));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/students/${STUDENT.id}`)));
      await assertFails(getDoc(doc(db, `${ROOT}/students/${OTHER_STUDENT.id}`)));
      await assertFails(getDocs(collection(db, `${ROOT}/students`)));

      await assertSucceeds(updateDoc(doc(db, `${ROOT}/students/${STUDENT.id}`), {
        lastSeenTablon: '2026-08-29T10:00:00.000Z'
      }));
      await assertFails(updateDoc(doc(db, `${ROOT}/students/${STUDENT.id}`), {
        internalNotes: 'Intento de modificación'
      }));
      await assertFails(updateDoc(doc(db, `${ROOT}/students/${OTHER_STUDENT.id}`), {
        lastSeenTablon: '2026-08-29T10:00:00.000Z'
      }));
    });

    await t.test('alumno: solo ve proyecciones y avisos destinados a alumnos', async () => {
      const db = authenticated(testEnv, STUDENT);

      await assertSucceeds(getDoc(doc(db, `${ROOT}/roleData/studentSettings`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/roleData/studentClassCatalog`)));
      await assertFails(getDoc(doc(db, `${ROOT}/roleData/adminProjection`)));
      await assertFails(getDoc(doc(db, `${ROOT}/settings/global`)));
      await assertFails(getDoc(doc(db, `${ROOT}/temporaryClassChanges/change-private`)));

      await assertSucceeds(getDoc(doc(db, `${ROOT}/announcements/announcement-all`)));
      await assertFails(getDoc(doc(db, `${ROOT}/announcements/announcement-teachers`)));
      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/announcements`),
        where('audienceType', 'in', ['all', 'sede', 'instrumento', 'profesor'])
      )));
      await assertFails(getDocs(collection(db, `${ROOT}/announcements`)));
    });

    await t.test('alumno: solo consulta sus clases, tickets y gestiones', async () => {
      const db = authenticated(testEnv, STUDENT);

      await assertSucceeds(getDoc(doc(
        db,
        `${ROOT}/users/${TEACHER.uid}/recurringClasses/class-own`
      )));
      await assertFails(getDoc(doc(
        db,
        `${ROOT}/users/${OTHER_TEACHER.uid}/recurringClasses/class-other`
      )));
      await assertFails(getDocs(query(
        collectionGroup(db, 'recurringClasses'),
        where('studentIds', 'array-contains', STUDENT.id)
      )));
      await assertSucceeds(getDocs(collectionGroup(db, 'recurringClasses')));

      await assertSucceeds(getDocs(query(
        collectionGroup(db, 'tickets'),
        where('studentEmail', '==', STUDENT.email)
      )));
      await assertFails(getDocs(query(
        collectionGroup(db, 'tickets'),
        where('studentId', '==', STUDENT.id)
      )));
      await assertFails(getDoc(doc(
        db,
        `${ROOT}/users/${OTHER_TEACHER.uid}/tickets/ticket-other`
      )));

      await assertSucceeds(getDoc(doc(db, `${ROOT}/gestiones/gestion-own`)));
      await assertFails(getDoc(doc(db, `${ROOT}/gestiones/gestion-other`)));
      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/gestiones`),
        where('studentEmail', '==', STUDENT.email)
      )));
      await assertFails(getDocs(collection(db, `${ROOT}/gestiones`)));

      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/temporaryRelocations`),
        where('studentEmail', '==', STUDENT.email)
      )));
      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/maintenancePeriods`),
        where('studentEmail', '==', STUDENT.email)
      )));
    });

    await t.test('alumno: solo crea solicitudes y evaluaciones con su identidad', async () => {
      const db = authenticated(testEnv, STUDENT);

      await assertSucceeds(setDoc(doc(db, `${ROOT}/gestiones/new-own`), {
        studentId: STUDENT.id,
        studentEmail: STUDENT.email,
        type: 'consulta',
        status: 'pendiente'
      }));
      await assertFails(setDoc(doc(db, `${ROOT}/gestiones/new-forged`), {
        studentId: OTHER_STUDENT.id,
        studentEmail: OTHER_STUDENT.email,
        type: 'consulta',
        status: 'pendiente'
      }));

      await assertSucceeds(setDoc(doc(db, `${ROOT}/teacherEvaluations/new-own`), {
        studentId: STUDENT.id,
        studentEmail: STUDENT.email,
        classId: 'class-own',
        period: '2026-09'
      }));
      await assertFails(setDoc(doc(db, `${ROOT}/teacherEvaluations/new-forged`), {
        studentId: OTHER_STUDENT.id,
        studentEmail: STUDENT.email,
        classId: 'class-other',
        period: '2026-09'
      }));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/teacherEvaluations/evaluation-own`)));
      await assertFails(getDoc(doc(db, `${ROOT}/teacherEvaluations/evaluation-other`)));

      await assertSucceeds(getDoc(doc(
        db,
        `${ROOT}/workshopRegistrations/workshop-1_${STUDENT.id}`
      )));
      await assertFails(getDoc(doc(
        db,
        `${ROOT}/workshopRegistrations/workshop-1_${OTHER_STUDENT.id}`
      )));
      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/workshopRegistrations`),
        where('studentEmail', '==', STUDENT.email)
      )));
      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/pollResponses`),
        where('studentEmail', '==', STUDENT.email)
      )));
      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/callResponses`),
        where('studentEmail', '==', STUDENT.email)
      )));
      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/teacherEvaluations`),
        where('studentEmail', '==', STUDENT.email),
        where('classId', '==', 'class-own'),
        where('period', '==', '2026-08')
      )));
    });

    await t.test('alumno: puede autorizar su ticket exacto para una recuperación, pero no consumirlo ni tocar tickets ajenos', async () => {
      const db = authenticated(testEnv, STUDENT);
      const ownTicket = doc(db, `${ROOT}/users/${TEACHER.uid}/tickets/ticket-own`);

      await assertSucceeds(updateDoc(ownTicket, {
        recoveryTeacherKeys: ['dago'],
        recoveryTeacherEmails: [OTHER_TEACHER.email],
        recoveryGestionIds: ['recovery-own'],
        recoveryAuthorizedAt: '2026-08-30T12:00:00.000Z'
      }));
      await assertFails(updateDoc(ownTicket, {
        isUsed: true,
        usedAt: '2026-08-30T12:05:00.000Z'
      }));
      await assertFails(updateDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/tickets/ticket-other`), {
        recoveryTeacherKeys: ['norman'],
        recoveryTeacherEmails: [TEACHER.email],
        recoveryGestionIds: ['forged'],
        recoveryAuthorizedAt: '2026-08-30T12:00:00.000Z'
      }));
    });

    await t.test('alta de alumno: solo puede reclamar una ficha con su propio email', async () => {
      const identity = {
        uid: 'new-student-uid',
        email: OTHER_STUDENT.email
      };
      const db = authenticated(testEnv, identity);

      await assertSucceeds(setDoc(doc(db, `${ROOT}/access/${identity.uid}`), {
        role: 'student',
        studentId: OTHER_STUDENT.id,
        email: identity.email,
        createdAt: '2026-08-29T10:00:00.000Z'
      }));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/students/${OTHER_STUDENT.id}`)));

      const attackerDb = authenticated(testEnv, {
        uid: 'attacker-uid',
        email: 'attacker@example.com'
      });
      await assertFails(setDoc(doc(attackerDb, `${ROOT}/access/attacker-uid`), {
        role: 'student',
        studentId: STUDENT.id,
        email: 'attacker@example.com'
      }));
    });

    await t.test('profesor autorizado: accede al trabajo docente pero no a administración', async () => {
      const db = authenticated(testEnv, TEACHER);

      await assertSucceeds(getDoc(doc(db, `${ROOT}/staffAccess/${TEACHER.email}`)));
      await assertSucceeds(getDocs(collection(db, `${ROOT}/students`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/settings/global`)));
      await assertFails(getDocs(collectionGroup(db, 'recurringClasses')));
      await assertSucceeds(getDocs(query(
        collectionGroup(db, 'recurringClasses'),
        where('authorizedTeacherEmails', 'array-contains', TEACHER.email)
      )));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/users/${TEACHER.uid}/recurringClasses/class-own`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/recurringClasses/class-other`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/temporaryClassChanges/change-private`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/temporaryClassChanges/change-other`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/temporaryClassChanges/change-shared`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/temporaryRelocations/relocation-shared`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/gestiones/gestion-own`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/gestiones/gestion-other`)));
      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/gestiones`),
        where('teacherEmails', 'array-contains', TEACHER.email)
      )));
      await assertSucceeds(getDocs(collection(db, `${ROOT}/gestiones`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/users/${TEACHER.uid}/tickets/ticket-own`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/tickets/ticket-other`)));
      await assertSucceeds(getDocs(query(
        collectionGroup(db, 'tickets'),
        where('teacherEmails', 'array-contains', TEACHER.email)
      )));
      await assertSucceeds(getDocs(query(
        collectionGroup(db, 'tickets'),
        where('recoveryTeacherEmails', 'array-contains', TEACHER.email)
      )));
      await assertSucceeds(getDocs(collectionGroup(db, 'tickets')));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/recurringClasses/class-temporary-shared`)));
      await assertSucceeds(updateDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/recurringClasses/class-temporary-shared`), {
        notes: 'Trabajo durante el cambio temporal'
      }));
      await assertFails(updateDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/recurringClasses/class-temporary-shared`), {
        capacity: 99
      }));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/tickets/ticket-recovery-shared`)));
      await assertSucceeds(updateDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/tickets/ticket-recovery-shared`), {
        isUsed: true,
        usedAt: '2026-09-01T18:00:00.000Z',
        usedOn: '2026-09-01',
        usedInSubject: 'Guitarra',
        usedInClassId: 'class-own'
      }));

      await assertSucceeds(updateDoc(doc(db, `${ROOT}/students/${STUDENT.id}`), {
        internalNotes: 'Nota docente actualizada'
      }));
      await assertFails(updateDoc(doc(db, `${ROOT}/students/${STUDENT.id}`), {
        email: 'cambiado@example.com'
      }));
      await assertFails(setDoc(doc(db, `${ROOT}/settings/global`), { hacked: true }));
      await assertFails(setDoc(doc(db, `${ROOT}/roleData/studentSettings`), { hacked: true }));
      await assertFails(setDoc(doc(db, `${ROOT}/staffAccess/intruso@escuelalosmitos.com`), {
        role: 'teacher',
        email: 'intruso@escuelalosmitos.com'
      }));
      await assertFails(updateDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/recurringClasses/class-other`), {
        notes: 'Intento sobre otra lista'
      }));
      await assertFails(updateDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/tickets/ticket-other`), {
        isUsed: true,
        usedAt: '2026-09-01T18:00:00.000Z',
        usedOn: '2026-09-01',
        usedInSubject: 'Batería',
        usedInClassId: 'class-other'
      }));
      await assertSucceeds(updateDoc(doc(db, `${ROOT}/users/${TEACHER.uid}/recurringClasses/class-own`), {
        notes: 'Nota de la clase propia'
      }));
    });

    await t.test('profesor autorizado: comparte la bolsa de sustituciones sin poder alterar ofertas ajenas', async () => {
      const db = authenticated(testEnv, TEACHER);

      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/substitutions`),
        where('status', '==', 'open')
      )));
      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/substitutions`),
        where('originalTeacherUid', '==', TEACHER.uid)
      )));
      await assertSucceeds(getDocs(collection(db, `${ROOT}/substitutions`)));
      await assertSucceeds(updateDoc(doc(db, `${ROOT}/substitutions/substitution-cross`), {
        status: 'assigned',
        assumedAt: '2026-08-30T13:00:00.000Z',
        assumedByUid: TEACHER.uid,
        assumedByEmail: TEACHER.email,
        assumedTeacherName: 'Norman',
        assumedClassId: 'assumed-substitution-cross',
        assumedClassRefPath: `${ROOT}/users/${TEACHER.uid}/recurringClasses/assumed-substitution-cross`
      }));
      await assertFails(updateDoc(doc(db, `${ROOT}/substitutions/substitution-forged`), {
        subject: 'Contenido manipulado'
      }));
      await assertFails(updateDoc(doc(db, `${ROOT}/substitutions/substitution-own`), {
        status: 'assigned',
        assumedAt: '2026-08-30T13:00:00.000Z',
        assumedByUid: TEACHER.uid,
        assumedByEmail: TEACHER.email,
        assumedTeacherName: 'Norman',
        assumedClassId: 'assumed-own',
        assumedClassRefPath: `${ROOT}/users/${TEACHER.uid}/recurringClasses/assumed-own`
      }));
    });

    await t.test('profesor autorizado: nómina, disponibilidad y tareas quedan separadas', async () => {
      const db = authenticated(testEnv, TEACHER);

      await assertSucceeds(getDoc(doc(db, `${ROOT}/payrollAdjustments/payroll-own`)));
      await assertFails(getDoc(doc(db, `${ROOT}/payrollAdjustments/payroll-other`)));
      await assertSucceeds(getDocs(query(
        collection(db, `${ROOT}/payrollAdjustments`),
        where('teacher', '==', 'Norman')
      )));
      await assertFails(getDocs(collection(db, `${ROOT}/payrollAdjustments`)));

      await assertSucceeds(setDoc(doc(db, `${ROOT}/availability/norman`), {
        slots: ['lunes-17']
      }));
      await assertFails(setDoc(doc(db, `${ROOT}/availability/dago`), {
        slots: ['lunes-18']
      }));

      await assertSucceeds(getDoc(doc(db, `${ROOT}/teacherTasks/task-own`)));
      await assertFails(getDoc(doc(db, `${ROOT}/teacherTasks/task-other`)));
      await assertSucceeds(setDoc(doc(db, `${ROOT}/teacherTasks/new-own`), {
        teacherUid: TEACHER.uid,
        teacherEmail: TEACHER.email,
        status: 'pending'
      }));
      await assertFails(setDoc(doc(db, `${ROOT}/teacherTasks/new-forged`), {
        teacherUid: OTHER_TEACHER.uid,
        teacherEmail: OTHER_TEACHER.email,
        status: 'pending'
      }));
      await assertSucceeds(deleteDoc(doc(db, `${ROOT}/teacherTasks/task-own`)));

      await assertSucceeds(setDoc(doc(db, `${ROOT}/users/${TEACHER.uid}`), {
        displayName: 'Norman actualizado'
      }));
      await assertFails(setDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}`), {
        displayName: 'Intento de acceso'
      }));

      await assertSucceeds(getDoc(doc(db, `${ROOT}/users/${TEACHER.uid}/records/record-own`)));
      await assertFails(getDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/records/record-other`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/users/${TEACHER.uid}/dailyReports/report-own`)));
      await assertFails(getDoc(doc(db, `${ROOT}/users/${OTHER_TEACHER.uid}/dailyReports/report-other`)));
    });

    await t.test('administrador: conserva acceso completo y publica disponibilidad', async () => {
      const db = authenticated(testEnv, ADMIN);

      await assertSucceeds(getDocs(collection(db, `${ROOT}/students`)));
      await assertSucceeds(getDocs(collection(db, `${ROOT}/staffAccess`)));
      await assertSucceeds(getDoc(doc(db, `${ROOT}/roleData/adminProjection`)));
      await assertSucceeds(setDoc(doc(db, `${ROOT}/settings/global`), {
        adminSetting: true
      }));
      await assertSucceeds(setDoc(doc(db, `${ROOT}/adminOnly/new-document`), {
        createdBy: ADMIN.uid
      }));
      await assertSucceeds(setDoc(doc(db, 'publicData/classAvailability'), {
        locations: ['Tarragona', 'Reus']
      }));
    });
  } finally {
    await testEnv.cleanup();
  }
});
