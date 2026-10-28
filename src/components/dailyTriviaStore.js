import { doc, runTransaction } from 'firebase/firestore';
import { getSchoolDate } from './vacationChallengeUtils.js';
import { scoreDailyTrivia } from './dailyTriviaUtils.js';

export const saveDailyTriviaAnswer = async ({ db, appId, studentId, session, selection }) => {
  if (session.date !== getSchoolDate()) throw new Error('Este reto ha terminado. Abre el reto del nuevo día.');
  const reference = doc(db, 'artifacts', appId, 'students', studentId);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error('No se ha encontrado tu perfil.');
    if (session.date !== getSchoolDate()) throw new Error('Este reto ha terminado. Abre el reto del nuevo día.');
    const profile = snapshot.data();
    if (profile.triviaLastPlayed >= session.date) throw new Error('Ya has jugado el reto de hoy.');
    const scored = scoreDailyTrivia(profile, session, selection);
    transaction.update(reference, scored.fields);
    return scored.result;
  });
};
