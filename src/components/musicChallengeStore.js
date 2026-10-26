import { collection, doc, getDoc, getDocs, query, where, runTransaction, serverTimestamp } from 'firebase/firestore';
import { vacationAttemptRef } from './vacationChallengeStore.js';
import { createVacationAttempt, isVacationChallengeOpen, summarizeVacationAnswers, timestampMillis } from './vacationChallengeUtils.js';
import { getMusicGame, nextMusicAssignment, normalizeMusicOrder, musicSeed } from './musicChallengeCatalog.js';

const progressRef = (db, appId, studentId) => doc(db, 'artifacts', appId, 'studentMusicProgress', studentId);
export const loadMusicSession = async (db, appId, studentId, dateStr) => {
  const snapshot = await getDoc(vacationAttemptRef(db, appId, studentId, dateStr));
  if (snapshot.exists()) return { attempt: { ...snapshot.data(), id: snapshot.id } };
  const [progress, settings] = await Promise.all([
    getDoc(progressRef(db, appId, studentId)), getDoc(doc(db, 'artifacts', appId, 'roleData', 'studentSettings'))
  ]);
  if (!settings.exists()) throw new Error('Falta publicar la configuración del área del alumno desde Administración.');
  let previous = progress.exists() ? progress.data() : null;
  if (!previous) {
    const history = await getDocs(query(collection(db, 'artifacts', appId, 'vacationChallengeAttempts'), where('studentId', '==', studentId)));
    const attempts = history.docs.map(item => item.data()).sort((a, b) => timestampMillis(b.startedAt) - timestampMillis(a.startedAt) || b.vacationDate.localeCompare(a.vacationDate));
    if (attempts.length) previous = { lastChallengeId: attempts[0].challengeId, nextOrdinal: attempts.length };
  }
  return { attempt: null, previous, assignment: nextMusicAssignment(previous, settings.data().musicChallengeOrder) };
};

export const startMusicAttempt = async ({ db, appId, student, dateStr, classData, difficulty, previous = null }) => {
  const reference = vacationAttemptRef(db, appId, student.id, dateStr);
  const progressReference = progressRef(db, appId, student.id);
  return runTransaction(db, async transaction => {
    const [existing, progress, settings] = await Promise.all([
      transaction.get(reference), transaction.get(progressReference), transaction.get(doc(db, 'artifacts', appId, 'roleData', 'studentSettings'))
    ]);
    if (existing.exists()) return { ...existing.data(), id: existing.id };
    const configuration = settings.data();
    if (!configuration || !isVacationChallengeOpen(dateStr, configuration.vacaciones || [])) throw new Error('El plazo de este reto ha terminado o la fecha no es de vacaciones.');
    const state = progress.exists() ? progress.data() : previous;
    const assignment = nextMusicAssignment(state, normalizeMusicOrder(configuration.musicChallengeOrder));
    const game = getMusicGame(assignment.challengeId);
    const attempt = {
      ...createVacationAttempt({ student, dateStr, classData, difficulty }), ...assignment,
      challengeTitle: game.title, contentVersion: 3, generatorVersion: 1, totalActivities: game.total,
      seed: String(musicSeed(`${student.id}|${dateStr}|${assignment.sequenceOrdinal}|${game.id}`)),
      ...summarizeVacationAnswers([]), startedAt: serverTimestamp(), updatedAt: serverTimestamp()
    };
    transaction.set(reference, attempt);
    transaction.set(progressReference, {
      studentId: student.id, lastChallengeId: game.id, nextOrdinal: assignment.sequenceOrdinal + 1,
      lastVacationDate: dateStr, lastAttemptId: reference.id,
      revision: progress.exists() ? Number(state.revision) + 1 : 0, updatedAt: serverTimestamp()
    });
    return { ...attempt, id: reference.id };
  });
};

export const saveMusicAttempt = async ({ db, appId, attempt, expectedRevision, vacationDates }) => {
  if (!isVacationChallengeOpen(attempt.vacationDate, vacationDates)) throw new Error('El plazo de este reto ha terminado.');
  const game = getMusicGame(attempt.challengeId);
  if (!game || attempt.contentVersion !== 3 || attempt.totalActivities !== game.total) throw new Error('Formato del reto no reconocido.');
  if (attempt.status === 'completed' && (attempt.answers.length !== game.total || attempt.cursor !== game.total)) throw new Error('Quedan actividades pendientes.');
  const reference = vacationAttemptRef(db, appId, attempt.studentId, attempt.vacationDate);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists() ? snapshot.data() : null;
    if (!current || current.revision !== expectedRevision) throw new Error('El intento cambió en otra pestaña o dispositivo. Cierra el reto y vuelve a abrirlo.');
    if (current.status === 'completed') throw new Error('Este intento ya está completado.');
    const immutable = ['studentId', 'vacationDate', 'challengeId', 'seed', 'generatorVersion', 'contentVersion', 'totalActivities', 'sequenceOrdinal'];
    if (immutable.some(key => attempt[key] !== current[key])) throw new Error('La identidad del reto ha cambiado. Vuelve a abrirlo.');
    const payload = { ...attempt, ...summarizeVacationAnswers(attempt.answers), revision: current.revision + 1,
      startedAt: current.startedAt, updatedAt: serverTimestamp(), ...(attempt.status === 'completed' ? { completedAt: serverTimestamp() } : {}) };
    delete payload.id; delete payload.adminSeenBy;
    transaction.set(reference, payload, { merge: true });
    return { ...current, ...payload, id: reference.id };
  });
};
