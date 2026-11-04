import { doc, runTransaction, arrayUnion, Timestamp } from "firebase/firestore";
import {
  RECOVERY_CAPACITY_VERSION,
  recoveryAvailabilityId,
  recoverySessionOccupancy,
  recoverySessionState,
  recoveryClassOccurs,
  recoveryDates,
  recoveryTargetsClass,
} from "./recoveryCapacityUtils.js";
const defaultSdk = { doc, runTransaction, arrayUnion };
const recoveryEnabled = (clase) =>
  clase.recoveryAccess === "allowed" ||
  (clase.recoveryAccess !== "blocked" &&
    clase.allowRecoveries !== false &&
    (clase.autoAdvanceStartDate !== true || clase.allowRecoveries === true));
const fail = (message) => {
  throw new Error(message);
};
const claimExpired = (claim) => {
  const value = claim?.expiresAt;
  const millis =
    typeof value?.toMillis === "function"
      ? value.toMillis()
      : Number(value?.seconds || 0) * 1000;
  return millis > 0 && millis < Date.now();
};
const subjectMatches = (ticket, subject) =>
  ticket.isGift ||
  ticket.subjectScope === "any" ||
  !ticket.subject ||
  String(ticket.subject).toLocaleLowerCase("es") === "cortesía escuela" ||
  String(ticket.subject).trim().toLocaleLowerCase("es") ===
    String(subject || "")
      .trim()
      .toLocaleLowerCase("es");

export function createRecoveryCapacityStore({ db, appId, sdk = defaultSdk }) {
  // Security rules can reject a stale cross-document commit before Firestore
  // reports its version conflict. Re-read once; the new state then produces the
  // capacity/ticket decision (or the original permission error if access is absent).
  const transact = async (callback) => {
    try {
      return await sdk.runTransaction(db, callback);
    } catch (error) {
      if (error.code !== "permission-denied") throw error;
      return sdk.runTransaction(db, callback);
    }
  };
  const ref = (collection, id) =>
    sdk.doc(db, "artifacts", appId, collection, id);
  const availabilityRef = (path) =>
    ref("recoveryAvailability", recoveryAvailabilityId(path));
  const ticketParts = (path) => {
    const parts = String(path || "").split("/");
    if (
      parts.length !== 6 ||
      parts[0] !== "artifacts" ||
      parts[1] !== appId ||
      parts[2] !== "users" ||
      parts[4] !== "tickets"
    )
      fail("Referencia de ticket no válida.");
    return { ticketOwnerUid: parts[3], ticketDocumentId: parts[5] };
  };
  const ticketClaimRef = (path) => {
    const parts = ticketParts(path);
    return sdk.doc(
      db,
      "artifacts",
      appId,
      "recoveryTicketClaims",
      parts.ticketOwnerUid,
      "claims",
      parts.ticketDocumentId,
    );
  };
  const claimData = (gestionId, payload, ticketPath, status) => ({
    studentId: payload.studentId,
    studentEmail: payload.studentEmail || "",
    gestionId,
    ticketRefPath: ticketPath,
    recoveryDate: payload.recoveryDate,
    status,
    ...ticketParts(ticketPath),
    expiresAt: Timestamp.fromDate(
      new Date(`${payload.recoveryDate}T23:59:59.999Z`),
    ),
  });
  const requestRef = (id) => ref("gestiones", id);
  const rosterRef = (path) => sdk.doc(db, path);
  const read = async (tx, path) => {
    const snapshot = await tx.get(path);
    return snapshot.exists() ? snapshot.data() : null;
  };
  const sameRequest = (request, gestionId) =>
    request?.type === "recuperacion" && Boolean(gestionId);

  const publish = async ({
    clase,
    today,
    options = {},
    pending = [],
    enabled = true,
    blockedDates = [],
  }) =>
    transact(async (tx) => {
      const current = await read(tx, rosterRef(clase.refPath));
      const previous = await read(tx, availabilityRef(clase.refPath));
      const canonical = current
        ? { ...current, id: clase.id, refPath: clase.refPath }
        : null;
      const dates = canonical
        ? recoveryDates(canonical, today, {
            limit: 121,
            horizon: 120,
            requireFree: false,
            blockedDates,
            includeToday: true,
          })
        : [];
      const candidates = new Set(
        Object.values(previous?.sessions || {}).flatMap(
          (session) => session.holds || [],
        ),
      );
      pending
        .filter((gestion) => recoveryTargetsClass(gestion, clase))
        .forEach((gestion) => candidates.add(gestion.id));
      const requests = await Promise.all(
        [...candidates].map(async (id) => ({
          id,
          request: await read(tx, requestRef(id)),
        })),
      );
      // Read claims before writing: a baja may have closed a request outside this store.
      const closedClaims = await Promise.all(
        requests
          .filter(
            ({ request }) =>
              request?.ticketRefPath &&
              request.status !== "pendiente" &&
              request.status !== "completado",
          )
          .map(async ({ id, request }) => ({
            id,
            path: request.ticketRefPath,
            claim: await read(tx, ticketClaimRef(request.ticketRefPath)),
          })),
      );
      const sessions = {};
      for (const date of dates) {
        const occupancy = recoverySessionOccupancy(canonical, date, options);
        sessions[date] = {
          baseCount: occupancy.baseCount,
          recoveryCount: occupancy.recoveryCount,
          expiresAt: Timestamp.fromDate(new Date(`${date}T23:59:59.999Z`)),
          holds: requests
            .filter(
              ({ request }) =>
                request?.status === "pendiente" &&
                request.recoveryDate === date &&
                recoveryTargetsClass(request, canonical),
            )
            .map(({ id }) => id)
            .sort(),
          cancelled: false,
        };
      }
      const data = {
        version: RECOVERY_CAPACITY_VERSION,
        classId: clase.id,
        classRefPath: clase.refPath,
        capacity: Math.max(0, Number(canonical?.capacity) || 0),
        enabled: Boolean(canonical && enabled && recoveryEnabled(canonical)),
        sessions,
      };
      const comparable = previous
        ? Object.fromEntries(
            Object.keys(data).map((key) => [key, previous[key]]),
          )
        : null;
      if (JSON.stringify(comparable) !== JSON.stringify(data))
        tx.set(availabilityRef(clase.refPath), {
          ...data,
          revision: Number(previous?.revision || 0) + 1,
          updatedAt: new Date().toISOString(),
        });
      closedClaims
        .filter(({ id, claim }) => claim?.gestionId === id)
        .forEach(({ path }) =>
          tx.update(ticketClaimRef(path), { status: "released" }),
        );
      return data;
    });

  const reserve = async ({ gestionId, payload, ticket }) =>
    transact(async (tx) => {
      if (!payload.requestedClassRefPath || !ticket?.refPath)
        fail(
          "No se ha podido identificar la clase o el ticket. Actualiza el panel.",
        );
      const aRef = availabilityRef(payload.requestedClassRefPath),
        claimRef = ticketClaimRef(ticket.refPath);
      const [availability, claim, actualTicket] = await Promise.all([
        read(tx, aRef),
        read(tx, claimRef),
        read(tx, rosterRef(ticket.refPath)),
      ]);
      if (claim?.gestionId === gestionId) return payload;
      if (
        !actualTicket ||
        actualTicket.isUsed ||
        actualTicket.voided ||
        actualTicket.studentId !== payload.studentId ||
        !subjectMatches(actualTicket, payload.requestedSubject)
      )
        fail("El ticket ya no está disponible.");
      if (
        (actualTicket.validFrom &&
          actualTicket.validFrom > payload.recoveryDate) ||
        (actualTicket.validUntil &&
          actualTicket.validUntil < payload.recoveryDate)
      )
        fail("El ticket no es válido para esta fecha.");
      if (claim && !claimExpired(claim) && claim.status !== "released")
        fail("Este ticket ya está reservado por otra recuperación.");
      if (recoverySessionState(availability, payload.recoveryDate).free <= 0)
        fail(
          "Se ha ocupado la última plaza de esta fecha. Elige otro día o turno.",
        );
      const holds = [
        ...new Set([
          ...(availability.sessions[payload.recoveryDate].holds || []),
          gestionId,
        ]),
      ];
      tx.update(aRef, {
        [`sessions.${payload.recoveryDate}.holds`]: holds,
        revision: availability.revision + 1,
        lastHoldId: gestionId,
        lastHoldDate: payload.recoveryDate,
        updatedAt: new Date().toISOString(),
      });
      tx.set(requestRef(gestionId), {
        ...payload,
        recoveryCapacityVersion: 1,
        recoveryAvailabilityId: recoveryAvailabilityId(
          payload.requestedClassRefPath,
        ),
        ...ticketParts(ticket.refPath),
      });
      tx.set(claimRef, claimData(gestionId, payload, ticket.refPath, "held"));
      if (payload.requestedTeacher)
        tx.update(rosterRef(ticket.refPath), {
          recoveryTeacherKeys: sdk.arrayUnion(...(payload.teacherKeys || [])),
          recoveryTeacherEmails: sdk.arrayUnion(
            ...(payload.teacherEmails || []),
          ),
          recoveryGestionIds: sdk.arrayUnion(gestionId),
          recoveryAuthorizedAt: new Date().toISOString(),
        });
      return payload;
    });

  const approve = async ({
    gestionId,
    clase,
    newStudentPayload,
    options = {},
    today,
  }) =>
    transact(async (tx) => {
      const gRef = requestRef(gestionId),
        cRef = rosterRef(clase.refPath),
        aRef = availabilityRef(clase.refPath);
      const [gestion, current, availability] = await Promise.all([
        read(tx, gRef),
        read(tx, cRef),
        read(tx, aRef),
      ]);
      if (!gestion || !sameRequest(gestion, gestionId))
        fail("No se encuentra la solicitud de recuperación.");
      if (gestion.status === "completado") return { alreadyApproved: true };
      if (gestion.status !== "pendiente")
        fail("Esta solicitud ya no está pendiente.");
      if (!recoveryTargetsClass(gestion, clase) || !current)
        fail("La clase de destino ha cambiado. Revisa la solicitud.");
      const canonical = { ...current, id: clase.id, refPath: clase.refPath },
        date = gestion.recoveryDate;
      if (
        date < today ||
        !recoveryClassOccurs(canonical, date) ||
        !recoveryEnabled(canonical) ||
        !recoverySessionState(availability, date).ready
      )
        fail(
          "La fecha o el acceso a recuperaciones de esta clase ya no están disponibles.",
        );
      const ticketPath =
        gestion.ticketRefPath || newStudentPayload.recoveryTicketRefPath;
      if (!ticketPath) fail("Falta la referencia del ticket.");
      const [ticket, claim] = await Promise.all([
        read(tx, rosterRef(ticketPath)),
        read(tx, ticketClaimRef(ticketPath)),
      ]);
      if (
        !ticket ||
        ticket.isUsed ||
        ticket.voided ||
        !subjectMatches(ticket, current.subject) ||
        ticket.studentId !== gestion.studentId ||
        (ticket.validFrom && ticket.validFrom > date) ||
        (ticket.validUntil && ticket.validUntil < date)
      )
        fail("El ticket ya no es válido.");
      if (
        claim &&
        claim.status !== "released" &&
        claim.gestionId !== gestionId &&
        !claimExpired(claim)
      )
        fail("Ese ticket está reservado por otra solicitud.");
      const occupancy = recoverySessionOccupancy(canonical, date, options);
      const existing = (current.students || []).find(
        (entry) =>
          entry.id === gestion.studentId &&
          entry.isRecovery &&
          entry.recoveryDate === date &&
          (!entry.recoveryGestionId || entry.recoveryGestionId === gestionId),
      );
      if (occupancy.studentIds.includes(String(gestion.studentId)) && !existing)
        fail("El alumno ya ocupa una plaza en esa sesión.");
      const others = new Set(
        (availability?.sessions?.[date]?.holds || []).filter(
          (id) => id !== gestionId,
        ),
      );
      // Missing related data in a teacher's snapshot must never reduce the
      // occupancy already published by administration for this session.
      const publishedSession = availability.sessions[date];
      const baseCount = Math.max(
        occupancy.baseCount,
        Number(publishedSession.baseCount || 0),
      );
      const recoveryCount = Math.max(
        occupancy.recoveryCount,
        Number(publishedSession.recoveryCount || 0),
      );
      const confirmedCount = baseCount + recoveryCount;
      if (
        !existing &&
        confirmedCount + others.size >=
          Math.max(0, Number(current.capacity) || 0)
      )
        fail(
          `No hay aforo para esta fecha: ${confirmedCount} personas confirmadas y ${others.size} solicitudes pendientes, capacidad ${current.capacity}.`,
        );
      const student = {
        ...newStudentPayload,
        id: gestion.studentId,
        isRecovery: true,
        recoveryDate: date,
        recoveryGestionId: gestionId,
      };
      const list = existing
        ? (current.students || []).map((entry) =>
            entry === existing ? { ...entry, ...student } : entry,
          )
        : [...(current.students || []), student];
      tx.update(cRef, {
        students: list,
        studentIds: [...new Set(list.map((row) => row.id).filter(Boolean))],
      });
      tx.update(gRef, {
        status: "completado",
        recoveryApprovedAt: new Date().toISOString(),
        recoveryCapacityVersion: 1,
        ticketRefPath: ticketPath,
        requestedClassRefPath: clase.refPath,
        ...ticketParts(ticketPath),
      });
      if (availability?.sessions?.[date])
        tx.update(aRef, {
          [`sessions.${date}.holds`]: [...others],
          [`sessions.${date}.baseCount`]: baseCount,
          [`sessions.${date}.recoveryCount`]:
            recoveryCount + (existing ? 0 : 1),
          revision: availability.revision + 1,
          lastActionId: gestionId,
          lastActionDate: date,
          updatedAt: new Date().toISOString(),
        });
      tx.set(
        ticketClaimRef(ticketPath),
        claimData(gestionId, gestion, ticketPath, "approved"),
      );
      return { alreadyApproved: false, students: list };
    });

  const release = async ({ gestionId, status, clase }) =>
    transact(async (tx) => {
      const gRef = requestRef(gestionId),
        gestion = await read(tx, gRef);
      if (!gestion || gestion.type !== "recuperacion") return;
      if (status === "rechazado" && gestion.status === "completado")
        fail(
          "Esta recuperación ya está aprobada. Para retirarla, utiliza la cancelación.",
        );
      const classPath = gestion.requestedClassRefPath || clase?.refPath;
      const [availability, claim, current] = await Promise.all([
        classPath ? read(tx, availabilityRef(classPath)) : null,
        gestion.ticketRefPath
          ? read(tx, ticketClaimRef(gestion.ticketRefPath))
          : null,
        classPath ? read(tx, rosterRef(classPath)) : null,
      ]);
      const date = gestion.recoveryDate;
      if (availability?.sessions?.[date])
        tx.update(availabilityRef(classPath), {
          [`sessions.${date}.holds`]: (
            availability.sessions[date].holds || []
          ).filter((id) => id !== gestionId),
          revision: availability.revision + 1,
          lastActionId: gestionId,
          lastActionDate: date,
          updatedAt: new Date().toISOString(),
        });
      if (claim?.gestionId === gestionId)
        tx.update(ticketClaimRef(gestion.ticketRefPath), {
          status: "released",
        });
      if (current && gestion.status === "completado") {
        const list = (current.students || []).filter(
          (entry) =>
            !(
              entry.isRecovery &&
              (entry.recoveryGestionId === gestionId ||
                (!entry.recoveryGestionId &&
                  entry.id === gestion.studentId &&
                  entry.recoveryDate === date))
            ),
        );
        tx.update(rosterRef(classPath), {
          students: list,
          studentIds: [
            ...new Set(list.map((entry) => entry.id).filter(Boolean)),
          ],
        });
        // The publication recomputes approved counts from the canonical roster.
        if (availability?.sessions?.[date])
          tx.update(availabilityRef(classPath), {
            [`sessions.${date}.recoveryCount`]: Math.max(
              0,
              Number(availability.sessions[date].recoveryCount || 0) -
                ((current.students || []).length > list.length ? 1 : 0),
            ),
          });
      }
      tx.update(gRef, {
        status,
        recoveryCapacityReleasedAt: new Date().toISOString(),
        ...(classPath ? { requestedClassRefPath: classPath } : {}),
        ...(gestion.ticketRefPath ? ticketParts(gestion.ticketRefPath) : {}),
      });
    });
  return { publish, reserve, approve, release };
}
