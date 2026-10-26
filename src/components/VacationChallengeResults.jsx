import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot, doc, FieldPath, serverTimestamp, runTransaction } from 'firebase/firestore';
import { TEMPO_CONTENT_VERSION } from './tempoChallengeContent.js';
import { buildMusicQuestionsForAttempt } from './musicChallengeContent.js';
import { getMusicGame, nextMusicAssignment } from './musicChallengeCatalog.js';
import { isUnreadVacationAttempt, summarizeVacationAnswers, timestampMillis, getSchoolDate, validVacationAnswers, buildVacationAttemptId } from './vacationChallengeUtils.js';

export default function VacationChallengeResults({ db, appId, studentId, adminUid }) {
  const [attempts, setAttempts] = useState([]);
  const [sequence, setSequence] = useState(null);
  const [musicOrder, setMusicOrder] = useState(null);
  useEffect(() => {
    const stopProgress = onSnapshot(doc(db, 'artifacts', appId, 'studentMusicProgress', studentId), snapshot => setSequence(snapshot.exists() ? snapshot.data() : null), () => setSequence(null));
    const stopSettings = onSnapshot(doc(db, 'artifacts', appId, 'roleData', 'studentSettings'), snapshot => setMusicOrder(snapshot.data()?.musicChallengeOrder || null), () => setMusicOrder(null));
    return () => { stopProgress(); stopSettings(); };
  }, [db, appId, studentId]);
  const [loaded, setLoaded] = useState(false);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [resetCandidate, setResetCandidate] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const resetLock = useRef(false);
  const [today, setToday] = useState(() => getSchoolDate());
  const marking = useRef(new Set());
  useEffect(() => { const timer = setInterval(() => setToday(getSchoolDate()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    return onSnapshot(query(collection(db, 'artifacts', appId, 'vacationChallengeAttempts'), where('studentId', '==', studentId)), { includeMetadataChanges: true }, snapshot => {
      setAttempts(snapshot.docs.map(item => ({ ...item.data(), id: item.id })).sort((a, b) => String(b.vacationDate).localeCompare(String(a.vacationDate))));
      setLoaded(true); setServerLoaded(!snapshot.metadata.fromCache);
    }, () => { setLoaded(false); setServerLoaded(false); setError('No se han podido cargar los retos de este alumno.'); });
  }, [db, appId, studentId, retry]);

  // Este efecto existe sólo mientras la pestaña está abierta y los resultados
  // se han mostrado. Entrar en CRM o en Resumen no consume las novedades.
  useEffect(() => {
    if (!loaded || !serverLoaded || !adminUid) return;
    const unread = attempts.filter(item => isUnreadVacationAttempt(item, adminUid) && !marking.current.has(item.id)).slice(0, 400);
    if (!unread.length) return;
    unread.forEach(item => marking.current.add(item.id));
    runTransaction(db, async transaction => {
      const references = unread.map(item => doc(db, 'artifacts', appId, 'vacationChallengeAttempts', item.id));
      const snapshots = await Promise.all(references.map(reference => transaction.get(reference)));
      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists()) return;
        const current = snapshot.data(), shown = unread[index];
        // Una lectura que estaba pendiente no debe marcar como visto un reto
        // reiniciado o completado otra vez después de abrir esta pestaña.
        if (current.status === 'completed' && current.revision === shown.revision
          && timestampMillis(current.completedAt) === timestampMillis(shown.completedAt)) {
          transaction.update(references[index], new FieldPath('adminSeenBy', adminUid), serverTimestamp());
        }
      });
    }).catch(() => setError('Los resultados están cargados, pero no se han podido marcar como vistos.')).finally(() => unread.forEach(item => marking.current.delete(item.id)));
  }, [attempts, loaded, serverLoaded, adminUid, db, appId]);

  const resetAttempt = async () => {
    if (resetLock.current || !adminUid || !resetCandidate || resetCandidate.studentId !== studentId
      || resetCandidate.id !== buildVacationAttemptId(studentId, resetCandidate.vacationDate)) return;
    resetLock.current = true; setResetting(true); setResetError(''); setResetMessage('');
    try {
      const reference = doc(db, 'artifacts', appId, 'vacationChallengeAttempts', resetCandidate.id);
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists() || snapshot.data().studentId !== studentId || snapshot.data().vacationDate !== resetCandidate.vacationDate) throw new Error('Intento no disponible');
        const current = snapshot.data();
        const clean = { ...current, contentVersion: current.contentVersion === 3 ? 3 : TEMPO_CONTENT_VERSION,
          status: 'in_progress', cursor: 0, answers: [], elapsedSeconds: 0,
          answered: 0, firstCorrect: 0, finalCorrect: 0, withHelp: 0,
          revision: Number(current.revision || 0) + 1, startedAt: serverTimestamp(), updatedAt: serverTimestamp() };
        delete clean.completedAt; delete clean.adminSeenBy;
        // La revisión sigue aumentando para que una pestaña antigua no pueda
        // guardar sus respuestas encima del intento que acaba de reiniciarse.
        transaction.set(reference, clean);
      });
      setResetCandidate(null); setExpanded(null);
      setResetMessage('Reto reiniciado. Cierra el reto en el portal del alumno y vuelve a abrirlo para empezar desde cero. El plazo de acceso sigue siendo el mismo.');
    } catch {
      setResetError('No se ha podido reiniciar el reto. Comprueba la conexión y vuelve a intentarlo.');
    } finally { resetLock.current = false; setResetting(false); }
  };

  return <section className="space-y-4" aria-label="Resultados de retos musicales">
    <div><h3 className="text-lg font-black">Retos musicales de vacaciones</h3><p className="text-xs text-zinc-500 mt-1">Un intento por alumno y fecha. Actividades voluntarias; los resultados no son una calificación académica.</p></div>
    {loaded && <p className="text-sm text-violet-800">Próximo juego al iniciar una nueva partida: <strong>{getMusicGame(nextMusicAssignment(sequence || (attempts.length ? { lastChallengeId: [...attempts].sort((a, b) => timestampMillis(b.startedAt) - timestampMillis(a.startedAt))[0].challengeId } : null), musicOrder).challengeId)?.title}</strong>. El catálogo continúa en ciclo.</p>}
    {resetCandidate?.studentId === studentId && <div role="group" aria-label="Confirmar reinicio del reto" className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3 text-red-950">
      <p className="text-sm font-black">¿Reiniciar el reto del {String(resetCandidate.vacationDate).split('-').reverse().join('/')}?</p>
      <p className="text-sm">Se borrarán las respuestas, las puntuaciones y el progreso de este intento. El alumno podrá volver a empezar si el reto sigue disponible por fecha. Sus puntos del Trivial y los demás retos se conservan.</p>
      <p className="text-xs">Cierra primero el reto en el portal del alumno. Después de reiniciarlo, vuelve a abrirlo.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setResetCandidate(null)} disabled={resetting} className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold disabled:opacity-50">Cancelar</button>
        <button type="button" onClick={resetAttempt} disabled={resetting} className="rounded-xl bg-red-700 text-white px-4 py-2 text-sm font-black disabled:opacity-50">{resetting ? 'Reiniciando…' : 'Sí, reiniciar este reto'}</button>
      </div>
    </div>}
    {resetError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{resetError}</p>}
    {resetMessage && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{resetMessage}</p>}
    {error && <p role="alert" className="p-4 rounded-xl bg-red-50 text-red-700 text-sm">{error} <button onClick={() => { setLoaded(false); setServerLoaded(false); setError(''); setRetry(value => value + 1); }} className="font-bold underline">Reintentar</button></p>}
    {!loaded && !error && <p className="text-sm text-zinc-500">Cargando resultados…</p>}
    {loaded && !attempts.length && <p className="p-6 rounded-2xl border border-dashed text-sm text-zinc-500">Este alumno todavía no ha empezado ningún reto musical de vacaciones.</p>}
    {attempts.filter(attempt => attempt.studentId === studentId).map(attempt => {
      const summary = summarizeVacationAnswers(attempt.answers);
      const completed = attempt.status === 'completed';
      const questions = buildMusicQuestionsForAttempt(attempt);
      const answerLevels = new Set(validVacationAnswers(attempt.answers).map(answer => answer.difficulty || attempt.difficulty));
      const difficultyLabel = answerLevels.size > 1 ? 'Dificultad mixta' : (answerLevels.values().next().value || attempt.difficulty) === 'advanced' ? 'Más desafío' : 'Iniciación';
      const expired = !completed && String(attempt.vacationDate) < today;
      return <article key={attempt.id} className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap justify-between gap-3"><div><p className="font-black">{attempt.challengeTitle || 'Detective del tempo'}</p><p className="text-xs text-zinc-500 mt-1">{String(attempt.vacationDate).split('-').reverse().join('/')} · {difficultyLabel} · {attempt.subject}</p></div><span className={`text-xs font-bold px-3 py-1 rounded-full self-start ${completed ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{completed ? 'Completado' : expired ? 'Incompleto · plazo terminado' : 'En curso'}</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-xs">{[[`${summary.answered}/${questions.length}`, 'Respondidas'], [summary.answered ? `${summary.firstCorrect}/${summary.answered}` : '—', 'Aciertos iniciales'], [summary.answered ? `${summary.finalCorrect}/${summary.answered}` : '—', 'Tras repasar'], [summary.withHelp, 'Con ayuda/reintento']].map(([value, label]) => <div key={label} className="bg-zinc-50 rounded-xl p-3"><strong className="block text-lg">{value}</strong>{label}</div>)}</div>
        {completed && timestampMillis(attempt.completedAt) > 0 && <p className="text-xs text-zinc-500 mt-3">Finalizado: {new Date(timestampMillis(attempt.completedAt)).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</p>}
        <button type="button" onClick={() => setExpanded(expanded === attempt.id ? null : attempt.id)} className="text-xs font-bold text-violet-700 underline mt-4">{expanded === attempt.id ? 'Ocultar respuestas' : 'Ver respuestas y explicaciones'}</button>
        <button type="button" onClick={() => { setResetCandidate(attempt); setResetError(''); setResetMessage(''); }} disabled={!loaded || !serverLoaded || resetting} className="ml-4 mt-4 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">Reiniciar reto</button>
        {expanded === attempt.id && <ol className="mt-4 space-y-3">{validVacationAnswers(attempt.answers).map(answer => {
          const item = questions.find(question => question.id === answer.questionId);
          return <li key={answer.questionId} className="border-t pt-3 text-sm"><p className="font-bold">{item?.prompt || answer.questionId}</p>{item?.objectives && <ul className="list-disc pl-5 mt-2 text-xs">{item.objectives.map(objective => <li key={objective}>{objective}</li>)}</ul>}<p className="text-xs text-violet-700 mt-1">Nivel de esta actividad: {(answer.difficulty || attempt.difficulty) === 'advanced' ? 'Más desafío' : 'Iniciación'}</p><p className="mt-1">Primera respuesta: {answer.firstSubmission?.join(' · ') || item?.options[answer.firstOption] || 'No registrada'} · {answer.firstCorrect ? 'Correcta' : 'Incorrecta'}</p><p>Última respuesta: {answer.submission?.join(' · ') || item?.options[answer.lastOption] || 'No registrada'} · Intentos: {answer.tries}{answer.hintUsed ? ' · Usó pista' : ''}</p><p className="text-xs text-zinc-500 mt-1">{item?.explanation}</p></li>;
        })}</ol>}
      </article>;
    })}
  </section>;
}
