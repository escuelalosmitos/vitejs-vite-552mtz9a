const text = value => String(value ?? '').trim();
const normalized = value => text(value).toLocaleLowerCase('es');

export function recoveryMatchesSession(gestion, student, session) {
  return gestion?.type === 'recuperacion'
    && gestion.status === 'completado'
    && text(gestion.studentId) === text(student.id)
    && gestion.recoveryDate === session.date
    && (gestion.requestedClassRefPath
      ? gestion.requestedClassRefPath === session.refPath
      : text(gestion.requestedClass) === text(session.classId)
        && normalized(gestion.requestedTeacher) === normalized(session.teacher)
        && Boolean(normalized(session.teacher)));
}

export async function readRecoveryAttendance({
  transaction, docAt, appId, student, liveEntry, session, gestiones, teacherEmail, isAdmin,
  ticketMatchesSubject
}) {
  const root = `artifacts/${appId}`;
  const bound = liveEntry || student;
  const incident = (reason, gestionId = '', ticketPath = '') => ({ reason, gestionId, ticketPath });
  const read = async path => {
    const snapshot = await transaction.get(docAt(path));
    return snapshot.exists() ? snapshot.data() : null;
  };
  const candidates = gestiones.filter(g => recoveryMatchesSession(g, student, session));
  const explicitId = text(bound.recoveryGestionId || student.recoveryGestionId);
  if (!explicitId && candidates.length > 1) return incident('Hay varias solicitudes aprobadas para esta sesión.');
  let gestionId = explicitId || text(candidates[0]?.id);
  if (gestionId.includes('/')) return incident('La referencia de la solicitud de recuperación no es válida.');
  let gestion = gestionId ? await read(`${root}/gestiones/${gestionId}`) : null;
  if (gestionId && (!liveEntry || !recoveryMatchesSession(gestion, student, session))) {
    return incident('La recuperación aprobada ya no coincide con esta sesión.', gestionId);
  }

  const entryPath = text(bound.recoveryTicketRefPath);
  const approvedPath = text(gestion?.ticketRefPath);
  const ticketPath = approvedPath || entryPath;
  const parts = ticketPath.split('/');
  const owner = parts[3];
  const ticketId = parts[5];
  if (parts.length !== 6 || parts[0] !== 'artifacts' || parts[1] !== appId || parts[2] !== 'users' || parts[4] !== 'tickets' || !owner || !ticketId) {
    return incident('Falta una referencia inequívoca al ticket de esta recuperación.', gestionId);
  }
  if ((entryPath && entryPath !== ticketPath) || [bound.recoveryTicketId, gestion?.ticketId].some(id => id && id !== ticketId)) {
    return incident('La solicitud aprobada y la lista tienen tickets distintos.', gestionId, ticketPath);
  }

  const [ticket, claim] = await Promise.all([
    read(ticketPath), read(`${root}/recoveryTicketClaims/${owner}/claims/${ticketId}`)
  ]);
  if (claim && claim.status !== 'released') {
    if (claim.status !== 'approved' || text(claim.studentId) !== text(student.id)
      || claim.recoveryDate !== session.date || claim.ticketRefPath !== ticketPath
      || typeof claim.gestionId !== 'string' || !claim.gestionId || claim.gestionId.includes('/')
      || (gestionId && claim.gestionId !== gestionId)) {
      return incident('El ticket está reservado o pendiente para otra recuperación.', gestionId, ticketPath);
    }
    if (!gestion) {
      gestionId = claim.gestionId;
      gestion = await read(`${root}/gestiones/${gestionId}`);
      if (!liveEntry || !recoveryMatchesSession(gestion, student, session) || gestion.ticketRefPath !== ticketPath) {
        return incident('La reserva del ticket no corresponde a esta clase.', gestionId, ticketPath);
      }
    }
  } else if (gestion?.recoveryCapacityVersion) {
    return incident('La solicitud aprobada ya no tiene una reserva vigente.', gestionId, ticketPath);
  } else if (gestiones.some(other => other.type === 'recuperacion' && other.status === 'completado'
    && other.id !== gestionId && other.ticketRefPath === ticketPath && other.recoveryDate >= session.date)) {
    return incident('Hay otra recuperación aprobada para este ticket.', gestionId, ticketPath);
  }

  if (!ticket || text(ticket.studentId) !== text(student.id) || ticket.voided
    || !ticketMatchesSubject(ticket, session.subject)
    || (ticket.validFrom && ticket.validFrom > session.date)
    || (ticket.validUntil && ticket.validUntil < session.date)) {
    return incident('El ticket asignado no es válido para este alumno, instrumento o fecha.', gestionId, ticketPath);
  }
  if (ticket.isUsed) {
    return incident(`El ticket asignado ya figura utilizado${ticket.usedOn ? ` (${ticket.usedOn})` : ''}.`, gestionId, ticketPath);
  }
  if (!isAdmin) {
    const hasAccess = [ticket.teacherEmails, ticket.recoveryTeacherEmails].some(emails => Array.isArray(emails) && emails.includes(normalized(teacherEmail)));
    if (!hasAccess) return incident('El perfil docente no tiene autorización para consumir este ticket.', gestionId, ticketPath);
    if (!Object.hasOwn(ticket, 'studentEmail') || !Object.hasOwn(ticket, 'subject')) {
      return incident('Al ticket le faltan datos necesarios para registrar el consumo.', gestionId, ticketPath);
    }
  }
  return { ticketPath };
}
