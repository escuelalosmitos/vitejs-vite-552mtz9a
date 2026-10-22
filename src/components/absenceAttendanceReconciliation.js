import * as firestoreApi from 'firebase/firestore';
import { findRecordedPresentAbsence, getAbsenceAttendanceUpdate, getRelatedAbsenceTickets } from './absenceAttendanceUtils.js';

// Reparar avisos anteriores sólo con una asistencia real guardada. No conceder
// tickets históricos ni abrir al alumno acceso a listas de otros estudiantes.
export const reconcileAttendedAbsence = async ({ db, appId, user, gestion, record }, api = firestoreApi) => {
  const { collectionGroup, query, where, getDocs, doc, runTransaction } = api;
  const gestionRef = doc(db, 'artifacts', appId, 'gestiones', gestion.id);
  const recordRef = doc(db, 'artifacts', appId, 'users', user.uid, 'records', record.id);
  const ticketSnapshot = await getDocs(query(collectionGroup(db, 'tickets'), where('studentId', '==', gestion.studentId)));
  const resolvedAt = new Date().toISOString();

  return runTransaction(db, async transaction => {
    // Releer los documentos antes de escribir: no aplicar una fotografía vieja
    // de la asistencia ni anular un ticket que se acaba de consumir.
    const [gestionSnap, recordSnap, ...ticketSnaps] = await Promise.all([
      transaction.get(gestionRef), transaction.get(recordRef),
      ...ticketSnapshot.docs.filter(ticket => ticket.ref.path.startsWith(`artifacts/${appId}/users/`)).map(ticket => transaction.get(ticket.ref))
    ]);
    if (!gestionSnap.exists() || !recordSnap.exists()) return false;
    const latestGestion = { ...gestionSnap.data(), id: gestionSnap.id };
    const latestRecord = { ...recordSnap.data(), id: recordSnap.id };
    if (!findRecordedPresentAbsence(latestGestion, [latestRecord])) return false;

    const relatedTickets = getRelatedAbsenceTickets(ticketSnaps.filter(snap => snap.exists()).map(snap => ({
      ...snap.data(), id: snap.id, refPath: snap.ref.path
    })), [latestGestion], latestGestion.studentId, latestRecord, latestRecord.date);
    const unused = relatedTickets.filter(ticket => !ticket.voided && !ticket.isUsed);
    const consumed = relatedTickets.filter(ticket => !ticket.voided && ticket.isUsed);
    if (unused.length) transaction.set(recordRef, {
      presentStudentIds: (latestRecord.students || []).filter(student => student.status === 'present' && !student.isRecovery).map(student => String(student.id))
    }, { merge: true });
    unused.forEach(ticket => transaction.set(doc(db, ticket.refPath), {
      isUsed: true, voided: true, voidReason: 'attendance_confirmed',
      voidedAt: resolvedAt, voidedBy: user.email || '',
      attendanceRecordId: latestRecord.id,
      attendanceCorrectedOn: latestRecord.date, attendanceClassId: latestRecord.classId || ''
    }, { merge: true }));
    transaction.set(gestionRef, getAbsenceAttendanceUpdate(latestGestion, {
      ticketOutcome: consumed.length ? 'attended_ticket_already_used' : 'attended',
      attendanceStatus: 'present',
      invalidatedTicketIds: unused.map(ticket => ticket.id),
      ticketConflictIds: consumed.map(ticket => ticket.id),
      attendanceReconciledFromRecord: recordRef.path
    }, resolvedAt), { merge: true });

    if (consumed.length) {
      transaction.set(doc(db, 'artifacts', appId, 'gestiones', `attendance-reconciliation-${gestion.id}`), {
        type: 'incidencia_ticket_asistencia', status: 'pendiente',
        title: 'Ticket ya utilizado tras confirmar una asistencia',
        details: `Consta asistencia el ${latestRecord.date}, pero el ticket de esa ausencia ya se utilizó. Requiere revisión administrativa.`,
        studentId: latestGestion.studentId, studentEmail: latestGestion.studentEmail || '',
        studentName: latestGestion.studentName || '', requestedClass: latestRecord.classId || '',
        requestedTeacher: latestRecord.teacher || '',
        teacherEmails: latestGestion.teacherEmails || [user.email],
        relatedTicketIds: consumed.map(ticket => ticket.id),
        source: 'attendance_ticket_reconciliation', date: resolvedAt, createdAt: resolvedAt
      }, { merge: true });
    }
    return true;
  });
};
