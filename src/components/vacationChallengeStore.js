import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { buildVacationAttemptId, isVacationChallengeOpen, summarizeVacationAnswers, VACATION_CHALLENGE_TOTAL } from './vacationChallengeUtils.js';

export const vacationAttemptRef = (db, appId, studentId, dateStr) => doc(db, 'artifacts', appId, 'vacationChallengeAttempts', buildVacationAttemptId(studentId, dateStr));
export const loadVacationAttempt = async (db, appId, studentId, dateStr) => {
  const snapshot = await getDoc(vacationAttemptRef(db, appId, studentId, dateStr));
  return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
};
export const saveVacationAttempt = async ({ db, appId, attempt, expectedRevision = null, vacationDates }) => {
  if (!isVacationChallengeOpen(attempt.vacationDate, vacationDates)) throw new Error('El plazo de este reto ya ha terminado.');
  const reference = vacationAttemptRef(db, appId, attempt.studentId, attempt.vacationDate);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    const existing = snapshot.exists() ? snapshot.data() : null;
    if (expectedRevision === null && existing) return { ...existing, id: snapshot.id };
    if (expectedRevision !== null && (!existing || existing.revision !== expectedRevision)) {
      throw new Error('El intento cambió en otra pestaña o dispositivo. Cierra el reto y vuelve a abrirlo para recuperar el último progreso.');
    }
    if (existing?.status === 'completed') throw new Error('Este intento ya está completado.');
    const completed = attempt.status === 'completed';
    if (completed && (attempt.answers.length !== VACATION_CHALLENGE_TOTAL || attempt.cursor !== VACATION_CHALLENGE_TOTAL)) throw new Error('Quedan actividades pendientes.');
    const summary = summarizeVacationAnswers(attempt.answers);
    const payload = {
      ...attempt, ...summary, revision: existing ? existing.revision + 1 : 0,
      updatedAt: serverTimestamp(),
      // El valor retornado al crear aún puede ser un serverTimestamp pendiente.
      // Conservar siempre el inicio ya resuelto que acaba de leer la transacción.
      startedAt: existing?.startedAt || serverTimestamp(),
      ...(completed ? { completedAt: serverTimestamp() } : {})
    };
    delete payload.id;
    // Nunca reemplazar marcas de lectura administrativas al guardar progreso.
    delete payload.adminSeenBy;
    transaction.set(reference, payload, { merge: true });
    return { ...existing, ...payload, id: reference.id };
  });
};
