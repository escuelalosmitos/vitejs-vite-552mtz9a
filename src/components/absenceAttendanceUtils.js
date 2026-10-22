const text = value => String(value || '').trim();
const subjectKey = value => text(value).toLocaleLowerCase('es');

export const getAbsenceDate = (gestion = {}) => {
  if (gestion.absenceDate) return text(gestion.absenceDate);
  const match = text(gestion.details).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
};

// Leer/archivar un aviso y resolver su asistencia son estados independientes.
export const retainGestionForAttendance = (gestion, today) => (
  gestion.type === 'aviso_ausencia'
  || gestion.status === 'pendiente'
  || text(gestion.recoveryDate) >= today
);

export const getMatchingAbsenceGestiones = (gestiones, studentId, session, date) => gestiones.filter(gestion => {
  if (gestion.type !== 'aviso_ausencia' || text(gestion.studentId) !== text(studentId)) return false;
  if (getAbsenceDate(gestion) !== text(date)) return false;
  if (gestion.requestedClass) return text(gestion.requestedClass) === text(session.classId);
  // Compatibilidad con avisos antiguos: nunca cruzar dos asignaturas/turnos.
  const subject = gestion.absenceSubject || text(gestion.title).replace(/^Falta a clase:\s*/i, '');
  if (!subject || subjectKey(subject) !== subjectKey(session.subject)) return false;
  const time = gestion.absenceTime || text(gestion.details).match(/a las (\d{1,2}:\d{2})/)?.[1];
  return !time || text(time) === text(session.time);
});

export const getRelatedAbsenceTickets = (tickets, gestiones, studentId, session, date) => tickets.filter(ticket => {
  if (text(ticket.studentId) !== text(studentId) || ticket.isGift === true || ticket.subjectScope === 'any') return false;
  if (ticket.absenceGestionId && gestiones.some(gestion => text(gestion.id) === text(ticket.absenceGestionId))) return true;
  return text(ticket.originalDate) === text(date)
    && subjectKey(ticket.subject) === subjectKey(session.subject)
    && (!ticket.originalClassId || text(ticket.originalClassId) === text(session.classId));
});

export const getAbsenceAttendanceUpdate = (gestion, payload, resolvedAt) => ({
  // Conservar el archivado y los demás estados informativos ya cerrados.
  status: gestion.status && gestion.status !== 'pendiente' ? gestion.status : 'completado',
  attendanceResolvedAt: resolvedAt,
  ...payload
});

export const findRecordedPresentAbsence = (gestion, records) => {
  if (gestion.type !== 'aviso_ausencia' || gestion.attendanceResolvedAt) return null;
  return records.find(record => {
    if (record.nonComputableReason === 'last_minute_class_not_taught') return false;
    if (!getMatchingAbsenceGestiones([gestion], gestion.studentId, record, record.date).length) return false;
    return (record.students || []).some(student => (
      text(student.id) === text(gestion.studentId) && !student.isRecovery && student.status === 'present'
    ));
  }) || null;
};
