import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch, FieldPath, serverTimestamp } from 'firebase/firestore';
import { buildTempoQuestions } from './tempoChallengeContent.js';
import { isUnreadVacationAttempt, summarizeVacationAnswers, timestampMillis, getSchoolDate, validVacationAnswers } from './vacationChallengeUtils.js';

export default function VacationChallengeResults({ db, appId, studentId, adminUid }) {
  const [attempts, setAttempts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(null);
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
    const batch = writeBatch(db);
    unread.slice(0, 400).forEach(item => batch.update(doc(db, 'artifacts', appId, 'vacationChallengeAttempts', item.id), new FieldPath('adminSeenBy', adminUid), serverTimestamp()));
    batch.commit().catch(() => setError('Los resultados están cargados, pero no se han podido marcar como vistos.')).finally(() => unread.forEach(item => marking.current.delete(item.id)));
  }, [attempts, loaded, serverLoaded, adminUid, db, appId]);

  return <section className="space-y-4" aria-label="Resultados de retos musicales">
    <div><h3 className="text-lg font-black">Retos musicales de vacaciones</h3><p className="text-xs text-zinc-500 mt-1">Un intento por alumno y fecha. Actividades voluntarias; los resultados no son una calificación académica.</p></div>
    {error && <p role="alert" className="p-4 rounded-xl bg-red-50 text-red-700 text-sm">{error} <button onClick={() => { setLoaded(false); setServerLoaded(false); setError(''); setRetry(value => value + 1); }} className="font-bold underline">Reintentar</button></p>}
    {!loaded && !error && <p className="text-sm text-zinc-500">Cargando resultados…</p>}
    {loaded && !attempts.length && <p className="p-6 rounded-2xl border border-dashed text-sm text-zinc-500">Este alumno todavía no ha empezado ningún reto musical de vacaciones.</p>}
    {attempts.map(attempt => {
      const summary = summarizeVacationAnswers(attempt.answers);
      const completed = attempt.status === 'completed';
      const questions = buildTempoQuestions(attempt.difficulty, attempt.vacationDate);
      const expired = !completed && String(attempt.vacationDate) < today;
      return <article key={attempt.id} className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap justify-between gap-3"><div><p className="font-black">{attempt.challengeTitle || 'Detective del tempo'}</p><p className="text-xs text-zinc-500 mt-1">{String(attempt.vacationDate).split('-').reverse().join('/')} · {attempt.difficulty === 'advanced' ? 'Más desafío' : 'Iniciación'} · {attempt.subject}</p></div><span className={`text-xs font-bold px-3 py-1 rounded-full self-start ${completed ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{completed ? 'Completado' : expired ? 'Incompleto · plazo terminado' : 'En curso'}</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-xs">{[[`${summary.answered}/36`, 'Respondidas'], [summary.answered ? `${summary.firstCorrect}/${summary.answered}` : '—', 'Aciertos iniciales'], [summary.answered ? `${summary.finalCorrect}/${summary.answered}` : '—', 'Tras repasar'], [summary.withHelp, 'Con ayuda/reintento']].map(([value, label]) => <div key={label} className="bg-zinc-50 rounded-xl p-3"><strong className="block text-lg">{value}</strong>{label}</div>)}</div>
        {completed && timestampMillis(attempt.completedAt) > 0 && <p className="text-xs text-zinc-500 mt-3">Finalizado: {new Date(timestampMillis(attempt.completedAt)).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</p>}
        <button type="button" onClick={() => setExpanded(expanded === attempt.id ? null : attempt.id)} className="text-xs font-bold text-violet-700 underline mt-4">{expanded === attempt.id ? 'Ocultar respuestas' : 'Ver respuestas y explicaciones'}</button>
        {expanded === attempt.id && <ol className="mt-4 space-y-3">{validVacationAnswers(attempt.answers).map(answer => {
          const item = questions.find(question => question.id === answer.questionId);
          return <li key={answer.questionId} className="border-t pt-3 text-sm"><p className="font-bold">{item?.prompt || answer.questionId}</p><p className="mt-1">Primera respuesta: {item?.options[answer.firstOption] || 'No registrada'} · {answer.firstCorrect ? 'Correcta' : 'Incorrecta'}</p><p>Última respuesta: {item?.options[answer.lastOption] || 'No registrada'} · Intentos: {answer.tries}{answer.hintUsed ? ' · Usó pista' : ''}</p><p className="text-xs text-zinc-500 mt-1">{item?.explanation}</p></li>;
        })}</ol>}
      </article>;
    })}
  </section>;
}
