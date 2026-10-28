export const formatLocatorTurn = (clase, dayName, centerName) => `${clase.subject} · ${dayName(clase.dayOfWeek)} ${clase.time}h · ${centerName(clase)} · ${clase.cuotaBase || 0} €/mes`;

// La validación interna conserva datos que ya no se imprimen en el correo.
export const locatorClassSignature = (clase, centerName = item => item.centerId || item.sede || '', teacherName = value => value || '') => JSON.stringify([
  clase.subject || '', Number(clase.dayOfWeek), clase.time || '', centerName(clase),
  teacherName(clase.teacher), Number(clase.duration || 60), Number(clase.cuotaBase || 0),
  Number(clase.capacity || 0), clase.autoAdvanceStartDate === true, clase.startDate || ''
]);
export const locatorStudentPlanningData = student => Object.fromEntries(Object.entries(student).filter(([key]) => (
  !key.startsWith('trivia') && !key.startsWith('lastSeen') && !['avatarPath', 'avatarUpdatedAt', 'authUid', 'claimed'].includes(key)
)));

// Usa el tipo general ya utilizado por otros correos de la plataforma.
// El complemento de Apps Script reconoce category para remitente y deduplicación.
export const buildLocatorEmailPayload = contact => ({
  type: 'notificacion_email', category: 'contacto_localizador',
  to: contact.to, subject: contact.subject, body: contact.body, requestId: contact.requestId,
  from: 'gestiones@escuelalosmitos.com', replyTo: 'gestiones@escuelalosmitos.com'
});
