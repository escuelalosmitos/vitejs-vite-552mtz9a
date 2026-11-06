import { reserveGymusik, cancelGymusik, initializeGymusikCredits, gymusikCreditRef } from '../src/components/gymusikCreditStore.js';
import { getSchoolDate, getSchoolParts, schoolDateTimeMillis } from '../src/components/vacationChallengeUtils.js';
import { createMitoversoContractDraft, createMitoversoAcceptance } from '../src/components/mitoversoContractUtils.js';
import { createMitolockerContractDraft, createMitolockerAcceptance } from '../src/components/mitolockerContractUtils.js';
// Regresiones de los permisos corregidos. A01 conserva expresamente la decisión de Paco.
// Solo se ejecutan contra Firestore Emulator, con identidades y datos ficticios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, writeBatch, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { buildGymusikReservationId, getGymusikMonth, getGymusikCreditsRemaining, getGymusikCreditsUsed } from '../src/components/gymusikUtils.js';

const emulator = process.env.FIRESTORE_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulator)) throw new Error('Se exige FIRESTORE_EMULATOR_HOST local. No se permite producción.');
const address = new URL(`http://${emulator}`);
const root = 'artifacts/default-app-id';
const person = { id: 'audit-student', uid: 'audit-uid', email: 'audit@example.com', name: 'Alumno ficticio' };
const classPath = `${root}/users/audit-teacher/recurringClasses/audit-class`;
const profile = { ...person, classes: ['audit-class'], globalStatus: 'activo', hasMitobox: false, hasGymusik: false };
const access = { role: 'student', studentId: person.id, email: person.email, portalEnabled: true };
const base = () => [
  [`${root}/students/${person.id}`, profile],
  [`${root}/access/${person.uid}`, access],
  [`${root}/roleData/studentClassCatalog`, { classes: [{ id: 'audit-class' }] }],
  [classPath, { teacher: 'Profesor ficticio', subject: 'Piano', studentIds: [person.id, 'peer'], students: [{ id: person.id }, { id: 'peer' }], exceptions: {}, autoCancelled: {} }]
];
const sources = new Map();
async function extract(file, name, context) {
  if (!sources.has(file)) {
    const source = await readFile(file, 'utf8');
    const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
    const nodes = new Map();
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') nodes.set(node.id.name, node.init);
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }
    walk(tree); sources.set(file, { source, nodes });
  }
  const { source, nodes } = sources.get(file); const node = nodes.get(name);
  assert.ok(node, `No se encuentra ${name}`);
  return vm.runInNewContext(`(${source.slice(...node.range)})`, context);
}

test('REGRESIONES: permisos y concurrencia, sin datos reales', async t => {
  const env = await initializeTestEnvironment({ projectId: 'demo-escuela-seguridad', firestore: { host: address.hostname, port: Number(address.port), rules: await readFile('firestore.rules', 'utf8') } });
  const student = (verified = true) => env.authenticatedContext(person.uid, { email: person.email, email_verified: verified }).firestore();
  async function seed(rows = base()) {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore(); const batch = writeBatch(db);
      for (const [path, data] of rows) batch.set(doc(db, path), data);
      await batch.commit();
    });
  }
  try {
    await t.test('A01: correo no verificado permite consultar y reclamar la ficha', async () => {
      await seed(base().filter(([path]) => !path.includes('/access/')));
      const db = student(false);
      const result = await assertSucceeds(getDocs(query(collection(db, root, 'students'), where('email', '==', person.email))));
      assert.equal(result.size, 1);
      await assertSucceeds(updateDoc(doc(db, root, 'students', person.id), { claimed: true, authUid: person.uid }));
      await assertSucceeds(setDoc(doc(db, root, 'access', person.uid), access));
      await assertSucceeds(getDoc(doc(db, root, 'roleData', 'studentClassCatalog')));
      await assertFails(getDocs(collection(db, root, 'students')));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), root, 'students', person.id)));
    });

    await t.test('A02: solo cambia su propia ausencia; cancelar el grupo requiere todas las faltas', async () => {
      await seed(); const db = student();
      await assertFails(updateDoc(doc(db, classPath), { exceptions: { '2026-11-12': { peer: 'absent' } }, autoCancelled: { '2026-11-12': true, '2026-11-19': true } }));
      const data = (await getDoc(doc(db, classPath))).data();
      assert.equal(data.exceptions['2026-11-12'], undefined);
      assert.equal(data.autoCancelled['2026-11-19'], undefined);
      await assertSucceeds(updateDoc(doc(db, classPath), { exceptions: { '2026-11-12': { [person.id]: 'notified' } }, lastAbsenceDate: '2026-11-12', lastAbsenceStudentId: person.id }));
      await assertFails(updateDoc(doc(db, classPath), { autoCancelled: { '2026-11-12': true } }));
      await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), classPath), { ['exceptions.2026-11-12.peer']: 'notified_no_ticket' }));
      await assertSucceeds(updateDoc(doc(db, classPath), { autoCancelled: { '2026-11-12': true } }));
      await assertFails(updateDoc(doc(db, classPath), { teacher: 'Otro profesor' }));
    });

    await t.test('A03: la reserva Mitobox ya cancelada no puede restar plazas otra vez', async () => {
      const slotId = 'audit-slot', ownId = 'old_audit-student';
      const slot = { reservationDate: '2026-11-20', reservationTime: '18:00', centerId: 'audit-center', roomId: 'audit-room', reservedCount: 2, capacity: 2, lastMutationId: 'other' };
      await seed([...base(), [`${root}/students/${person.id}`, { ...profile, hasMitobox: true }],
        [`${root}/mitoboxSlots/${slotId}`, slot],
        [`${root}/mitoboxReservations/${ownId}`, { studentId: person.id, studentEmail: person.email, slotId, reservationDate: slot.reservationDate, reservationTime: slot.reservationTime, status: 'cancelled' }],
        ...['peer1','peer2'].map(id => [`${root}/mitoboxReservations/${id}`, { studentId: id, studentEmail: `${id}@example.com`, slotId, status: 'confirmed' }])]);
      const db = student(); const slotRef = doc(db, root, 'mitoboxSlots', slotId);
      await assertFails(updateDoc(slotRef, { reservedCount: 1, lastMutationId: ownId }));
      await assertFails(updateDoc(slotRef, { reservedCount: 0, lastMutationId: ownId }));
      assert.equal((await getDoc(slotRef)).data().reservedCount, 2);
    });

    await t.test('A04: Gymusik rechaza restar sin una cancelación nueva', async () => {
      await seed([...base(), [`${root}/students/${person.id}`, { ...profile, hasGymusik: true }],
        [`${root}/gymusikMembers/${person.id}`, { status: 'active', creditLedgerVersion: 1 }],
        [`${root}/gymusikSessions/audit-session`, { status: 'published', capacity: 2, reservedCount: 2, waitlistCount: 0, teacherEmail: 'teacher@example.com', lastReservationId: 'peer' }],
        [`${root}/gymusikReservations/old_audit-student`, { studentId: person.id, studentEmail: person.email, sessionId: 'audit-session', status: 'cancelled' }]]);
      const db = student(); const ref = doc(db, root, 'gymusikSessions', 'audit-session');
      await assertFails(updateDoc(ref, { reservedCount: 1, lastReservationId: 'old_audit-student' }));
      await assertFails(updateDoc(ref, { reservedCount: 0, lastReservationId: 'old_audit-student' }));
      assert.equal((await getDoc(ref)).data().reservedCount, 2);
    });

    await t.test('A05: dos reservas reales disputan el último crédito y solo una lo obtiene', async () => {
      const sessions = Array.from({ length: 5 }, (_, i) => ({ id: `audit-g${i}`, date: `2026-11-${String(12+i).padStart(2,'0')}`, time: '18:00', instrument: 'Piano', status: 'published', capacity: 4, reservedCount: i < 3 ? 1 : 0, waitlistCount: 0, teacherEmail: 'teacher@example.com' }));
      const previous = sessions.slice(0,3).map(s => ({ studentId: person.id, studentEmail: person.email, sessionId: s.id, sessionDate: s.date, status: 'confirmed' }));
      await seed([...base(), [`${root}/students/${person.id}`, { ...profile, hasGymusik: true }],
        [`${root}/gymusikMembers/${person.id}`, { status: 'active', creditLedgerVersion: 1 }],
        [`${root}/gymusikSettings/main`, { active: true, monthlyCredits: 4, cancellationHours: 24 }],
        ...sessions.map(s => [`${root}/gymusikSessions/${s.id}`, s]),
        ...previous.map(r => [`${root}/gymusikReservations/${buildGymusikReservationId(r.sessionId,person.id)}`, r]),
        [`${root}/gymusikCredits/${person.id}/months/2026-11`, { studentId: person.id, studentEmail: person.email, month: '2026-11', reservationIds: previous.map(r => buildGymusikReservationId(r.sessionId,person.id)), lastReservationId: '', revision: 1 }]]);
      assert.equal(getGymusikCreditsRemaining({ reservations: previous, studentId: person.id, month: '2026-11', monthlyCredits: 4 }), 1);
      const results = await Promise.allSettled([reserveGymusik({db:student(),appId:'default-app-id',profile:person,session:sessions[3]}),reserveGymusik({db:student(),appId:'default-app-id',profile:person,session:sessions[4]})]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.filter(r=>r.status==='rejected').length,1);
      const rows = (await getDocs(query(collection(student(), root, 'gymusikReservations'), where('studentEmail','==',person.email)))).docs.map(s => s.data());
      assert.equal(getGymusikCreditsUsed({ reservations: rows, studentId: person.id, month: '2026-11' }), 4);
      const latest = rows.find(r => r.sessionId === sessions[3].id || r.sessionId === sessions[4].id);
      latest.id = buildGymusikReservationId(latest.sessionId, person.id);
      assert.equal(await cancelGymusik({ db: student(), appId: 'default-app-id', reservation: latest }), true);
      const budget = await getDoc(gymusikCreditRef(student(), 'default-app-id', person.id, '2026-11'));
      assert.equal(budget.data().reservationIds.length, 3);
      assert.equal(await cancelGymusik({ db: student(), appId: 'default-app-id', reservation: latest }), false);
      assert.equal((await getDoc(gymusikCreditRef(student(), 'default-app-id', person.id, '2026-11'))).data().reservationIds.length, 3);
      const unreserved = sessions.slice(3).find(s => s.id !== latest.sessionId);
      await assertSucceeds(reserveGymusik({ db: student(), appId: 'default-app-id', profile: person, session: unreserved }));
    });

    await t.test('A06: alumno sin Mitobox no puede crear reservas antiguas migrables', async () => {
      await seed(); const db = student();
      await assertFails(setDoc(doc(db, root, 'gestiones', 'audit-legacy'), { studentId: person.id, studentEmail: person.email, type: 'reserva_mitobox', status: 'completado', reservationDate: '2026-11-20', reservationTime: '18:00', centerId: 'audit-center', roomId: 'audit-room' }));
      await assertFails(setDoc(doc(db, root, 'mitoboxSlots', 'audit-slot'), { reservedCount: 1, capacity: 2 }));
    });

    await t.test('A07: la baja total revoca el vínculo antiguo y un servicio independiente conserva acceso', async () => {
      await seed([...base(), [`${root}/students/${person.id}`, { ...profile, globalStatus: 'baja', classes: [] }]]);
      const db = student();
      await assertFails(getDoc(doc(db, root, 'roleData', 'studentClassCatalog')));
      await assertFails(setDoc(doc(db, root, 'gestiones', 'audit-after-baja'), { studentId: person.id, studentEmail: person.email, type: 'aviso_ausencia', status: 'pendiente' }));
      await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), root, 'students', person.id), { globalStatus:'activo', hasMitobox:true }));
      await assertSucceeds(getDoc(doc(db, root, 'roleData', 'studentClassCatalog')));
      // Control: si portalEnabled se revoca expresamente, esta lectura sí se deniega.
      await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), root, 'access', person.uid), { portalEnabled: false }));
      await assertFails(getDoc(doc(db, root, 'roleData', 'studentClassCatalog')));
    });
    await t.test('A08: contrato Mitoverso obligatorio, recibido con sello de servidor e inmutable para alumno', async () => {
      await seed(); const db=student();
      const payload={studentId:person.id,studentEmail:person.email,type:'alta_mitoverso',status:'pendiente',extraMonthlyFee:10};
      await assertFails(setDoc(doc(db,root,'gestiones','verse-without'),payload));
      const draft={...createMitoversoContractDraft(person,{uid:person.uid,email:person.email},10),signerFullName:'Persona Ficticia',studentFullName:'Persona Ficticia',accepted:true,immediateStart:true};
      const contract=await createMitoversoAcceptance(draft);
      await assertSucceeds(setDoc(doc(db,root,'gestiones','verse-with'),{...payload,mitoversoContract:{...contract,acceptedAt:serverTimestamp()}}));
      await assertFails(updateDoc(doc(db,root,'gestiones','verse-with'),{'mitoversoContract.monthlyFee':20}));
      await assertFails(setDoc(doc(db,root,'gestiones','verse-forged-identity'),{...payload,tadosiDone:true,mitoversoIdentityVerifiedAt:new Date().toISOString(),mitoversoContract:{...contract,acceptedAt:serverTimestamp()}}));
    });
    await t.test('Mitolocker exige aceptación propia y preserva el resguardo administrativo por separado', async () => {
      await seed();
      const db = student();
      const admin = env.authenticatedContext('audit-admin', { email: 'paco@escuelalosmitos.com' }).firestore();
      const payloads = [];
      for (const mode of ['compartido', 'exclusivo']) {
        const draft = { ...createMitolockerContractDraft(person, person), mode, instrument: 'Guitarra ficticia', accepted: true };
        const acceptance = await createMitolockerAcceptance(draft);
        const payload = {
          studentId: person.id, studentName: person.name, studentEmail: person.email, type: 'alta_mitolocker',
          title: 'Solicitud Mitolocker', details: 'Solicitud ficticia', date: new Date().toISOString(), status: 'pendiente',
          mitolockerMode: mode, extraService: `mitolocker_${mode}`, extraMonthlyFee: acceptance.monthlyFee,
          requiresManualActivation: true, requiresTadosiSetup: mode === 'exclusivo', tadosiDone: false,
          mitolockerContract: { ...acceptance, acceptedAt: serverTimestamp() }
        };
        payloads.push(payload);
        const ref = doc(db, root, 'gestiones', `locker-${mode}`);
        await assertSucceeds(setDoc(ref, payload));
        await assertSucceeds(getDoc(ref));
        await assertSucceeds(updateDoc(ref, { adminCopySentAt: new Date().toISOString() }));
        await assertFails(updateDoc(ref, { 'mitolockerContract.mode': 'otro' }));
        await assertFails(updateDoc(doc(admin, ref.path), { 'mitolockerContract.text': 'reescritura' }));
      }
      const [shared] = payloads;
      const { mitolockerContract, ...withoutContract } = shared;
      await assertFails(setDoc(doc(db, root, 'gestiones', 'locker-without'), withoutContract));
      const invalid = [
        { ...shared, status: 'completado' }, { ...shared, extraMonthlyFee: 5 },
        { ...shared, mitolockerMode: 'exclusivo' }, { ...shared, teacherEmails: ['staff@example.com'] },
        { ...shared, mitolockerContract: { ...mitolockerContract, accepted: false } },
        { ...shared, mitolockerContract: { ...mitolockerContract, authUid: 'other-uid' } },
        { ...shared, mitolockerContract: { ...mitolockerContract, acceptedAt: Timestamp.fromMillis(1) } },
        { ...shared, mitolockerContract: { ...mitolockerContract, instrument: 'x'.repeat(161) } }
      ];
      for (const [index, payload] of invalid.entries()) await assertFails(setDoc(doc(db, root, 'gestiones', `locker-invalid-${index}`), payload));

      const receiptPath = `${root}/gestiones/locker-compartido/mitolockerDelivery/record`;
      const receipt = { instrument: 'Guitarra ficticia', brand: '', model: '', serial: '123', finish: '', case: '', accessories: '', condition: 'Buen estado', declaredValue: '', date: '2026-11-06', mode: 'compartido', recordedAt: serverTimestamp() };
      await assertFails(setDoc(doc(admin, receiptPath), receipt));
      await assertSucceeds(updateDoc(doc(admin, root, 'gestiones', 'locker-compartido'), { status: 'completado' }));
      await assertFails(setDoc(doc(db, receiptPath), receipt));
      await assertSucceeds(setDoc(doc(admin, receiptPath), receipt));
      await assertSucceeds(getDoc(doc(admin, receiptPath)));
      await assertFails(getDoc(doc(db, receiptPath)));
      await assertFails(updateDoc(doc(admin, receiptPath), { serial: 'otro' }));
      await assertSucceeds(updateDoc(doc(admin, root, 'students', person.id), { classes: [], hasMitobox: true }));
      await assertFails(setDoc(doc(db, root, 'gestiones', 'locker-without-class'), shared));
    });
    await t.test('A09: la preparación administrativa incluye las reservas antiguas y no admite que el alumno invente el saldo', async () => {
      await seed([...base(), [`${root}/students/${person.id}`, { ...profile, hasGymusik: true }],
        [`${root}/gymusikMembers/${person.id}`, { studentEmail: person.email, status: 'active' }],
        [`${root}/gymusikReservations/old-confirmed`, { studentId: person.id, sessionDate: '2026-11-12', status: 'confirmed' }],
        [`${root}/gymusikReservations/old-spent`, { studentId: person.id, sessionDate: '2026-11-13', status: 'cancelled', creditConsumed: true }],
        [`${root}/gymusikReservations/old-returned`, { studentId: person.id, sessionDate: '2026-11-14', status: 'cancelled', creditConsumed: false }]]);
      await assertFails(setDoc(gymusikCreditRef(student(), 'default-app-id', person.id, '2026-11'), { reservationIds: [] }));
      const admin = env.authenticatedContext('audit-admin', { email: 'paco@escuelalosmitos.com' }).firestore();
      await initializeGymusikCredits({ db: admin, appId: 'default-app-id', member: { id: person.id } });
      const budget = (await getDoc(gymusikCreditRef(student(), 'default-app-id', person.id, '2026-11'))).data();
      assert.deepEqual(budget.reservationIds, ['old-confirmed', 'old-spent']);
      assert.equal((await getDoc(doc(student(), root, 'gymusikMembers', person.id))).data().creditLedgerVersion, 1);
      await assertFails(updateDoc(gymusikCreditRef(student(), 'default-app-id', person.id, '2026-11'), { reservationIds: [] }));
    });
    await t.test('A10: Firestore también exige 24 horas, hora real y aforo publicado para Mitobox', async () => {
      await seed([...base(), [`${root}/students/${person.id}`, { ...profile, hasMitobox: true }], [`${root}/roleData/studentSettings`, { mitoboxRoomCapacities: { 'center__room': 2 } }]]);
      const db=student(), tomorrow=getSchoolDate(Date.now()+86400000), future=getSchoolDate(Date.now()+48*3600000), hour=getSchoolParts(Date.now()).hour;
      const time=`${String(hour).padStart(2,'0')}:00`;
      const book=async(id,date,clock,startsAt,capacity=2)=>{
        const batch=writeBatch(db), reservationId=`${id}_${person.id}`,slotId=`slot-${id}`;
        batch.set(doc(db,root,'mitoboxSlots',slotId),{reservationDate:date,reservationTime:clock,centerId:'center',roomId:'room',reservedCount:1,capacity,lastMutationId:reservationId});
        batch.set(doc(db,root,'mitoboxReservations',reservationId),{studentId:person.id,studentEmail:person.email,status:'confirmed',slotId,reservationDate:date,reservationTime:clock,startsAt:Timestamp.fromMillis(startsAt)});
        return batch.commit();
      };
      // Al minuto cero de la hora actual, mañana faltan menos de 24 h.
      await assertFails(book('too-soon',tomorrow,time,schoolDateTimeMillis(tomorrow,time)));
      await assertFails(book('forged-clock',tomorrow,time,schoolDateTimeMillis(future,'18:00')));
      await assertFails(book('invented-capacity',future,'18:00',schoolDateTimeMillis(future,'18:00'),99));
      if(future.slice(0,7)===getSchoolDate().slice(0,7)) await assertSucceeds(book('valid',future,'18:00',schoolDateTimeMillis(future,'18:00')));
    });
    await t.test('A11: una cancelación tardía de Gymusik conserva el crédito y no admite falsificar su devolución', async () => {
      const instant=Date.now()+3600000, parts=getSchoolParts(instant), date=getSchoolDate(instant), time=`${String(parts.hour).padStart(2,'0')}:${String(parts.minute).padStart(2,'0')}`;
      const session={id:'late',date,time,instrument:'Piano',teacherEmail:'teacher@example.com',status:'published',capacity:2,reservedCount:0,waitlistCount:0};
      await seed([...base(), [`${root}/students/${person.id}`, {...profile,hasGymusik:true}], [`${root}/gymusikMembers/${person.id}`, {status:'active',creditLedgerVersion:1}], [`${root}/gymusikSettings/main`,{active:true,monthlyCredits:4,cancellationHours:24}], [`${root}/gymusikSessions/late`,session]]);
      const db=student();await reserveGymusik({db,appId:'default-app-id',profile:person,session});
      const id=buildGymusikReservationId(session.id,person.id),ref=doc(db,root,'gymusikReservations',id),credit=gymusikCreditRef(db,'default-app-id',person.id,date.slice(0,7));
      const batch=writeBatch(db);
      batch.update(ref,{status:'cancelled',creditConsumed:false,creditReturned:true});
      batch.update(doc(db,root,'gymusikSessions',session.id),{reservedCount:0,lastReservationId:id});
      batch.update(credit,{reservationIds:[],revision:2,lastReservationId:id});
      await assertFails(batch.commit());
      assert.equal(await cancelGymusik({db,appId:'default-app-id',reservation:{id,sessionId:session.id}}),false);
      assert.equal((await getDoc(credit)).data().reservationIds.length,1);
      assert.equal((await getDoc(ref)).data().creditConsumed,true);
    });
  } finally { await env.cleanup(); }
});
