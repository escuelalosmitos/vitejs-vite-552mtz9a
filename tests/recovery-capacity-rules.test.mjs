import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { createRecoveryCapacityStore } from "../src/components/recoveryCapacityStore.js";
import {
  addRecoveryDays,
  recoveryAvailabilityId,
  recoverySessionState,
} from "../src/components/recoveryCapacityUtils.js";

const appId = "default-app-id",
  root = `artifacts/${appId}`;
const admin = { uid: "a", email: "paco@escuelalosmitos.com" },
  teacher = { uid: "t", email: "norman@escuelalosmitos.com" };
const one = { uid: "u1", id: "s1", email: "s1@example.com" },
  two = { uid: "u2", id: "s2", email: "s2@example.com" };
const today = new Date().toISOString().slice(0, 10),
  date = addRecoveryDays(today, 7),
  later = addRecoveryDays(date, 7);
const classPath = `${root}/users/t/recurringClasses/target`;
const clase = {
  id: "target",
  refPath: classPath,
  teacher: "Norman",
  teacherEmail: teacher.email,
  authorizedTeacherEmails: [teacher.email],
  subject: "Piano",
  capacity: 4,
  dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay(),
  isRecurring: true,
  students: [{ id: "fixed1" }, { id: "fixed2" }, { id: "fixed3" }],
  studentIds: ["fixed1", "fixed2", "fixed3"],
};
const ticketFor = (s, n = "ticket") => ({
  id: n,
  refPath: `${root}/users/t/tickets/${s.id}-${n}`,
});
const request = (s, overrides = {}) => ({
  type: "recuperacion",
  status: "pendiente",
  studentId: s.id,
  studentName: s.id,
  studentEmail: s.email,
  requestedClass: "target",
  requestedClassRefPath: classPath,
  requestedSubject: "Piano",
  requestedTeacher: "Norman",
  teacherKeys: ["norman"],
  teacherEmails: [teacher.email],
  recoveryDate: date,
  ticketId: ticketFor(s).id,
  ticketRefPath: ticketFor(s).refPath,
  ...overrides,
});
const auth = (env, s) =>
  env
    .authenticatedContext(s.uid, { email: s.email, email_verified: true })
    .firestore();

test("recuperaciones: aforo y ticket atómicos con reglas reales", async (t) => {
  const env = await initializeTestEnvironment({
    projectId: "demo-escuela-seguridad",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
  const adminDb = auth(env, admin),
    teacherDb = auth(env, teacher),
    oneDb = auth(env, one),
    twoDb = auth(env, two);
  const store = (db) => createRecoveryCapacityStore({ db, appId });
  const aRef = (db) =>
    doc(
      db,
      `${root}/recoveryAvailability/${recoveryAvailabilityId(classPath)}`,
    );
  const gRef = (db, id) => doc(db, `${root}/gestiones/${id}`);
  const claimRef = (db, s) =>
    doc(db, `${root}/recoveryTicketClaims/t/claims/${s.id}-ticket`);
  const reset = async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, `${root}/staffAccess/${teacher.email}`), {
        role: "teacher",
        email: teacher.email,
        teacherNameLower: "norman",
      });
      await setDoc(doc(db, classPath), clase);
      for (const s of [one, two]) {
        await setDoc(doc(db, `${root}/access/${s.uid}`), {
          role: "student",
          studentId: s.id,
          email: s.email,
          portalEnabled: true,
        });
        await setDoc(doc(db, `${root}/students/${s.id}`), {
          name: s.id,
          email: s.email,
          classes: ["own"],
        });
        await setDoc(doc(db, ticketFor(s).refPath), {
          studentId: s.id,
          studentEmail: s.email,
          subject: "Piano",
          isUsed: false,
          validFrom: today,
          validUntil: addRecoveryDays(today, 90),
          teacherEmails: [teacher.email],
        });
      }
    });
    await store(adminDb).publish({ clase, today });
  };
  try {
    await t.test(
      "dos alumnos disputan el último hueco: solo una solicitud y una retención",
      async () => {
        await reset();
        const attempts = await Promise.allSettled([
          store(oneDb).reserve({
            gestionId: "r1",
            payload: request(one),
            ticket: ticketFor(one),
          }),
          store(twoDb).reserve({
            gestionId: "r2",
            payload: request(two),
            ticket: ticketFor(two),
          }),
        ]);
        assert.equal(
          attempts.filter((r) => r.status === "fulfilled").length,
          1,
        );
        assert.match(
          attempts.find((r) => r.status === "rejected").reason.message,
          /última plaza/,
        );
        const availability = (await getDoc(aRef(adminDb))).data();
        assert.equal(availability.sessions[date].holds.length, 1);
        assert.equal(recoverySessionState(availability, date).free, 0);
        assert.equal(recoverySessionState(availability, later).free, 1);
        assert.equal(
          (await getDocs(collection(adminDb, `${root}/gestiones`))).size,
          1,
        );
      },
    );
    await t.test(
      "un mismo ticket no reserva dos fechas aunque ambas tengan hueco",
      async () => {
        await reset();
        const results = await Promise.allSettled(
          [date, later].map((recoveryDate, i) =>
            store(oneDb).reserve({
              gestionId: `same-${i}`,
              payload: request(one, { recoveryDate }),
              ticket: ticketFor(one),
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.match(
          results.find((r) => r.status === "rejected").reason.message,
          /ticket ya está reservado/,
        );
      },
    );
    await t.test(
      "un profesor puede aprobar la reserva sin permisos de administración",
      async () => {
        await reset();
        await store(oneDb).reserve({
          gestionId: "teacher",
          payload: request(one),
          ticket: ticketFor(one),
        });
        await store(teacherDb).approve({
          gestionId: "teacher",
          clase,
          newStudentPayload: {},
          today,
        });
        assert.equal(
          (await getDoc(gRef(adminDb, "teacher"))).data().status,
          "completado",
        );
      },
    );
    await t.test(
      "admin y profesor aprueban a la vez sin duplicar ni superar cuatro",
      async () => {
        await reset();
        await store(oneDb).reserve({
          gestionId: "race",
          payload: request(one),
          ticket: ticketFor(one),
        });
        const args = {
          gestionId: "race",
          clase,
          newStudentPayload: {
            id: one.id,
            name: "Uno",
            recoveryTicketRefPath: ticketFor(one).refPath,
          },
          today,
        };
        const results = await Promise.all([
          store(adminDb).approve(args),
          store(teacherDb).approve(args),
        ]);
        assert.equal(results.filter((r) => r.alreadyApproved).length, 1);
        const current = (await getDoc(doc(adminDb, classPath))).data();
        assert.equal(current.students.length, 4);
        const availability = (await getDoc(aRef(adminDb))).data();
        assert.equal(availability.sessions[date].holds.length, 0);
        assert.equal(availability.sessions[date].recoveryCount, 1);
        assert.equal(
          (await getDoc(claimRef(adminDb, one))).data().status,
          "approved",
        );
        await assert.rejects(
          store(twoDb).reserve({
            gestionId: "fifth",
            payload: request(two),
            ticket: ticketFor(two),
          }),
          /última plaza/,
        );
      },
    );
    await t.test(
      "rechazo libera hueco y ticket; una nueva solicitud puede usarlo",
      async () => {
        await reset();
        await store(oneDb).reserve({
          gestionId: "reject",
          payload: request(one),
          ticket: ticketFor(one),
        });
        await store(teacherDb).release({
          gestionId: "reject",
          status: "rechazado",
          clase,
        });
        assert.equal(
          (await getDoc(claimRef(adminDb, one))).data().status,
          "released",
        );
        assert.equal(
          recoverySessionState((await getDoc(aRef(adminDb))).data(), date).free,
          1,
        );
        await store(oneDb).reserve({
          gestionId: "retry",
          payload: request(one),
          ticket: ticketFor(one),
        });
        assert.equal(
          (await getDoc(gRef(adminDb, "retry"))).data().status,
          "pendiente",
        );
      },
    );
    await t.test(
      "aprobación relee la plantilla aunque la disponibilidad estuviera desactualizada",
      async () => {
        await reset();
        await store(oneDb).reserve({
          gestionId: "stale",
          payload: request(one),
          ticket: ticketFor(one),
        });
        await updateDoc(doc(adminDb, classPath), {
          students: [...clase.students, { id: "new-fixed" }],
          studentIds: [...clase.studentIds, "new-fixed"],
        });
        await assert.rejects(
          store(adminDb).approve({
            gestionId: "stale",
            clase,
            newStudentPayload: {},
            today,
          }),
          /No hay aforo/,
        );
        assert.equal(
          (await getDoc(gRef(adminDb, "stale"))).data().status,
          "pendiente",
        );
        assert.equal(
          (await getDoc(doc(adminDb, classPath))).data().students.length,
          4,
        );
      },
    );
    await t.test(
      "solicitudes antiguas se concilian y no permiten aceptar un quinto",
      async () => {
        await reset();
        const legacy = [
          ["old1", one],
          ["old2", two],
        ].map(([id, s]) => ({ id, ...request(s) }));
        for (const { id, ...data } of legacy)
          await setDoc(gRef(adminDb, id), data);
        await store(adminDb).publish({ clase, today, pending: legacy });
        await assert.rejects(
          store(adminDb).approve({
            gestionId: "old1",
            clase,
            newStudentPayload: {},
            today,
          }),
          /No hay aforo/,
        );
        await store(adminDb).release({
          gestionId: "old2",
          status: "rechazado",
          clase,
        });
        await store(adminDb).approve({
          gestionId: "old1",
          clase,
          newStudentPayload: {},
          today,
        });
        assert.equal(
          (await getDoc(doc(adminDb, classPath))).data().students.length,
          4,
        );
      },
    );
    await t.test(
      "cancelar una aprobada elimina solo esa recuperación y conserva otras fechas",
      async () => {
        await reset();
        const other = {
          id: one.id,
          isRecovery: true,
          recoveryDate: later,
          recoveryGestionId: "other",
        };
        await updateDoc(doc(adminDb, classPath), {
          students: [...clase.students, other],
        });
        await store(adminDb).publish({ clase, today });
        await store(oneDb).reserve({
          gestionId: "cancel",
          payload: request(one),
          ticket: ticketFor(one),
        });
        await store(adminDb).approve({
          gestionId: "cancel",
          clase,
          newStudentPayload: {},
          today,
        });
        await store(adminDb).release({
          gestionId: "cancel",
          status: "cancelado",
          clase,
        });
        const current = (await getDoc(doc(adminDb, classPath))).data();
        assert.equal(current.students.length, 4);
        assert.deepEqual(current.students.at(-1), other);
        assert.equal(
          recoverySessionState((await getDoc(aRef(adminDb))).data(), date).free,
          1,
        );
      },
    );
    await t.test(
      "no se puede forzar un trámite sin reserva ni alterar capacidad o contador",
      async () => {
        await reset();
        const payload = request(one);
        await assertFails(setDoc(gRef(oneDb, "unpaired"), payload));
        await assertFails(updateDoc(aRef(oneDb), { capacity: 100 }));
        await assertFails(
          updateDoc(aRef(oneDb), { [`sessions.${date}.baseCount`]: 0 }),
        );
        await assertFails(
          setDoc(doc(oneDb, `${root}/recoveryAvailability/invented`), {
            enabled: true,
            capacity: 100,
          }),
        );
        await assertSucceeds(getDoc(aRef(oneDb)));
        await assertFails(
          getDoc(aRef(env.unauthenticatedContext().firestore())),
        );
        await store(oneDb).reserve({
          gestionId: "private",
          payload,
          ticket: ticketFor(one),
        });
        await assertFails(getDoc(claimRef(twoDb, one)));
        await assertFails(
          updateDoc(claimRef(oneDb, one), { status: "released" }),
        );
      },
    );
    await t.test(
      "no se adelanta caducidad ni se cambian fechas para reutilizar el ticket",
      async () => {
        await reset();
        await store(oneDb).reserve({
          gestionId: "tamper",
          payload: request(one),
          ticket: ticketFor(one),
        });
        await assertFails(
          updateDoc(claimRef(oneDb, one), { expiresAt: new Date(0) }),
        );
        await assertFails(
          updateDoc(gRef(oneDb, "tamper"), { recoveryDate: later }),
        );
      },
    );
    await t.test(
      "el profesor no reduce una ocupación publicada que su copia local no incluye",
      async () => {
        await reset();
        await store(oneDb).reserve({
          gestionId: "partial",
          payload: request(one),
          ticket: ticketFor(one),
        });
        await updateDoc(aRef(adminDb), { [`sessions.${date}.baseCount`]: 4 });
        await assert.rejects(
          store(teacherDb).approve({
            gestionId: "partial",
            clase,
            newStudentPayload: {},
            today,
          }),
          /No hay aforo/,
        );
        assert.equal(
          (await getDoc(gRef(adminDb, "partial"))).data().status,
          "pendiente",
        );
      },
    );
    await t.test(
      "la publicación conserva reservas que no estaban en la copia del administrador",
      async () => {
        await reset();
        await store(oneDb).reserve({
          gestionId: "fresh",
          payload: request(one),
          ticket: ticketFor(one),
        });
        await store(adminDb).publish({ clase, today, pending: [] });
        assert.deepEqual(
          (await getDoc(aRef(adminDb))).data().sessions[date].holds,
          ["fresh"],
        );
        await updateDoc(gRef(adminDb, "fresh"), { status: "cancelado" });
        await store(adminDb).publish({ clase, today, pending: [] });
        assert.equal(
          (await getDoc(claimRef(adminDb, one))).data().status,
          "released",
        );
        assert.equal(
          recoverySessionState((await getDoc(aRef(adminDb))).data(), date).free,
          1,
        );
      },
    );
  } finally {
    await env.cleanup();
  }
});
