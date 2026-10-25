import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Volume2, Play, Pause, ChevronRight, Lightbulb, CheckCircle, AlertCircle } from 'lucide-react';
import { buildTempoQuestionsForAttempt, upgradeTempoAttempt, TEMPO_LESSONS } from './tempoChallengeContent.js';
import { playTempoClip } from './tempoChallengeAudio.js';
import { createVacationAttempt, isVacationChallengeOpen, recordVacationAnswer, summarizeVacationAnswers, readChallengeClock } from './vacationChallengeUtils.js';
import { loadVacationAttempt, saveVacationAttempt } from './vacationChallengeStore.js';

export default function VacationChallengePlayer({ db, appId, user, student, dateStr, classData, vacationDates, onClose }) {
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');
  const [busy, setBusy] = useState(false);
  const [showLesson, setShowLesson] = useState(true);
  const [selected, setSelected] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [hint, setHint] = useState(false);
  const [heard, setHeard] = useState({});
  const [playing, setPlaying] = useState('');
  const [volume, setVolume] = useState(0.65);
  const [clock, setClock] = useState(readChallengeClock);
  const audioStop = useRef(null);
  const audioGeneration = useRef(0);
  const alive = useRef(true);
  const elapsedSince = useRef(0);
  const operationLock = useRef(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const questions = useMemo(() => buildTempoQuestionsForAttempt(attempt, difficulty, dateStr), [attempt, difficulty, dateStr]);
  const cursor = attempt?.cursor || 0;
  const current = questions[cursor];
  const chapter = current?.chapter || 0;
  const currentAnswer = attempt?.answers?.[cursor];
  const hasFeedback = Boolean(currentAnswer && !retrying);
  const open = isVacationChallengeOpen(dateStr, vacationDates, clock);
  const summary = summarizeVacationAnswers(attempt?.answers || []);

  const stopAudio = () => { audioGeneration.current++; audioStop.current?.(); audioStop.current = null; setPlaying(''); };
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => setClock(readChallengeClock()), 1000);
    const pauseHiddenAudio = () => {
      if (document.hidden) { audioGeneration.current++; audioStop.current?.(); audioStop.current = null; setPlaying(''); }
    };
    document.addEventListener('visibilitychange', pauseHiddenAudio);
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', pauseHiddenAudio); audioStop.current?.(); };
  }, []);
  useEffect(() => {
    let active = true;
    loadVacationAttempt(db, appId, student.id, dateStr).then(data => {
      if (!active) return;
      setAttempt(upgradeTempoAttempt(data)); setDifficulty(data?.difficulty || 'beginner'); setShowLesson(true);
      setSelected(data?.answers?.[data.cursor]?.lastOption ?? null);
      elapsedSince.current = readChallengeClock();
    }).catch(() => {
      if (active) setError('No se ha podido cargar tu intento. Comprueba la conexión y que estén publicadas las reglas actualizadas.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, appId, student.id, dateStr, loadVersion]);
  useEffect(() => { if (!open) { audioGeneration.current++; audioStop.current?.(); audioStop.current = null; } }, [open]);

  const persist = async next => {
    if (operationLock.current) return null;
    operationLock.current = true; setBusy(true); setError('');
    try {
      const elapsed = Math.min(300, Math.max(0, Math.floor((readChallengeClock() - elapsedSince.current) / 1000)));
      const saved = await saveVacationAttempt({ db, appId, attempt: { ...next, elapsedSeconds: (attempt?.elapsedSeconds || 0) + elapsed }, expectedRevision: attempt?.revision ?? null, vacationDates });
      elapsedSince.current = readChallengeClock();
      const prepared = upgradeTempoAttempt(saved);
      if (alive.current) setAttempt(prepared);
      return prepared;
    } catch (failure) {
      if (alive.current) setError(failure.message || 'No se ha podido guardar. Mantén esta ventana abierta y reintenta.');
      return null;
    } finally { operationLock.current = false; if (alive.current) setBusy(false); }
  };
  const begin = async () => {
    try {
      await persist(createVacationAttempt({ student: { ...student, email: user.email }, dateStr, classData, difficulty }));
    } catch (failure) { setError(failure.message); }
  };
  const changeDifficulty = async value => {
    if (busy || !open || !attempt || attempt.status === 'completed' || !['beginner', 'advanced'].includes(value) || value === attempt.difficulty) return;
    stopAudio();
    const saved = await persist({ ...attempt, difficulty: value });
    if (!saved) return;
    setDifficulty(value);
    // Si ya se ha respondido, se conserva ese ejercicio, incluso al reintentarlo.
    // Las actividades aún no respondidas se regeneran con el nivel elegido.
    if (!currentAnswer) { setSelected(null); setHint(false); setHeard({}); setRetrying(false); }
  };
  const listen = async (clip, key) => {
    stopAudio(); setError(''); setPlaying(key);
    const generation = audioGeneration.current;
    try {
      const stop = await playTempoClip(clip, { volume, onEnd: () => {
        if (!alive.current || generation !== audioGeneration.current) return;
        setPlaying(''); setHeard(previous => ({ ...previous, [key]: (previous[key] || 0) + 1 }));
      } });
      if (!alive.current || generation !== audioGeneration.current) stop(); else audioStop.current = stop;
    } catch (failure) { setPlaying(''); setError(failure.message || 'No se ha podido reproducir. Pulsa Escuchar para reintentarlo.'); }
  };
  const submit = async () => {
    if (selected === null || !current) return;
    const answers = [...attempt.answers];
    answers[cursor] = recordVacationAnswer(currentAnswer, current, selected, {
      hintUsed: hint, listenCount: current.clips.reduce((count, _clip, index) => count + (heard[`${current.id}-${index}`] || 0), 0)
    });
    const saved = await persist({ ...attempt, answers });
    if (saved) { setRetrying(false); stopAudio(); }
  };
  const next = async () => {
    stopAudio();
    const nextCursor = cursor + 1;
    const saved = await persist({ ...attempt, cursor: nextCursor, status: nextCursor === questions.length ? 'completed' : 'in_progress' });
    if (!saved) return;
    setSelected(null); setRetrying(false); setHint(false); setHeard({});
    if (questions[nextCursor]?.chapter !== chapter) setShowLesson(true);
  };
  const close = async () => {
    stopAudio();
    if (attempt && attempt.status !== 'completed' && open) {
      const saved = await persist(attempt);
      if (!saved) return;
    }
    onClose();
  };
  const audioButton = (clip, key, label) => (
    <button type="button" key={key} onClick={() => playing === key ? stopAudio() : listen(clip, key)} disabled={!open || busy} className={`rounded-xl border p-4 text-left font-bold flex items-center gap-3 disabled:opacity-50 ${playing === key ? 'bg-violet-100 border-violet-400 text-violet-900' : 'bg-white border-zinc-200 hover:border-violet-400'}`}>
      {playing === key ? <Pause className="w-5 h-5"/> : <Play className="w-5 h-5"/>}<span>{label}</span>
      {heard[key] > 0 && <CheckCircle className="w-4 h-4 text-emerald-600 ml-auto"/>}
    </button>
  );

  return <div role="dialog" aria-modal="true" aria-labelledby="vacation-game-title" className="fixed inset-0 z-[200] bg-black/70 flex items-start sm:items-center justify-center p-2 sm:p-5 overflow-y-auto">
    <div className="w-full max-w-3xl rounded-3xl bg-zinc-50 shadow-2xl my-3 overflow-hidden max-h-[94dvh] flex flex-col text-slate-900">
      <header className="bg-violet-950 text-white p-5 sm:p-6 flex justify-between gap-4 shrink-0">
        <div><p className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Reto musical de vacaciones · {dateStr.split('-').reverse().join('/')}</p><h2 id="vacation-game-title" className="text-xl sm:text-2xl font-black mt-1">Detective del tempo</h2><p className="text-xs text-violet-200 mt-2">Disponible hasta las 23:59 de esa fecha · Hora de la escuela</p></div>
        <button type="button" onClick={close} disabled={busy} aria-label="Guardar y cerrar reto" className="self-start p-2 rounded-full hover:bg-white/10 disabled:opacity-50"><X/></button>
      </header>
      <div className="p-5 sm:p-7 overflow-y-auto space-y-5">
        {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800"><AlertCircle className="w-4 h-4 inline mr-2"/>{error}{!attempt && <button type="button" onClick={() => { setLoading(true); setError(''); setLoadVersion(value => value + 1); }} className="ml-3 font-bold underline">Reintentar</button>}<button type="button" onClick={onClose} className="ml-3 underline">Cerrar</button></div>}
        {loading ? <p className="py-10 text-center font-bold">Cargando tu progreso…</p> : !open ? <div className="p-5 bg-violet-50 rounded-2xl"><h3 className="font-black">El plazo de este reto ha terminado</h3><p className="mt-2 text-sm">Tus respuestas guardadas se conservan. Encontrarás tu próxima clase en la tarjeta habitual.</p><button onClick={onClose} className="mt-5 px-5 py-3 rounded-xl bg-black text-white font-bold">Volver a mis clases</button></div> : !attempt ? <>
          <h3 className="text-xl font-black">¿Más rápido, más fuerte o más agudo?</h3><p className="text-sm leading-relaxed">Aprende a distinguir el tempo, el pulso, la intensidad y la altura mediante 36 actividades con melodías diferentes, explicaciones y un reto final. La duración orientativa es de unos 30 minutos, según las escuchas y tu ritmo.</p>
          <p className="text-sm">Usa un volumen cómodo. No necesitas instrumento ni micrófono. Puedes parar y continuar dentro del plazo de tu tarjeta.</p>
          <fieldset><legend className="font-bold mb-3">Elige tu dificultad</legend><div className="grid sm:grid-cols-2 gap-3">{[['beginner', 'Iniciación', 'Diferencias claras y acompañamiento paso a paso.'], ['advanced', 'Más desafío', 'Diferencias de tempo más próximas y escucha más fina.']].map(([value, title, description]) => <label key={value} className={`p-4 border rounded-xl cursor-pointer ${difficulty === value ? 'border-violet-600 bg-violet-50' : 'bg-white border-zinc-200'}`}><input type="radio" name="tempo-difficulty" value={value} checked={difficulty === value} onChange={() => setDifficulty(value)}/><strong className="ml-2">{title}</strong><span className="block mt-2 text-sm text-zinc-600">{description}</span></label>)}</div></fieldset>
          <button type="button" onClick={begin} disabled={busy || Boolean(error)} className="w-full bg-black text-white rounded-xl py-4 font-black disabled:opacity-50">{busy ? 'Preparando…' : 'Empezar mi reto'}</button>
        </> : attempt.status === 'completed' ? <>
          <h3 className="text-2xl font-black">¡Investigación completada!</h3><p>Has trabajado el pulso, el tempo y las diferencias entre velocidad, intensidad y altura.</p>
          <div className="grid sm:grid-cols-3 gap-3">{[[summary.firstCorrect, 'Aciertos iniciales'], [summary.finalCorrect, 'Aciertos tras repasar'], [summary.withHelp, 'Actividades con ayuda o reintento']].map(([value, title]) => <div className="bg-white rounded-xl border p-4" key={title}><strong className="text-2xl">{value}/{questions.length}</strong><p className="text-xs mt-2">{title}</p></div>)}</div>
          <p className="text-sm text-zinc-600">Tu resultado está guardado. Lo importante es reconocer qué cambia en el sonido y poder explicar por qué. Es una actividad de aprendizaje, sin nota académica.</p><button onClick={onClose} className="w-full bg-black text-white rounded-xl py-4 font-bold">Volver a mis clases</button>
        </> : <>
          <div><div className="flex justify-between text-xs font-bold mb-2"><span>{TEMPO_LESSONS[chapter].title}</span><span>{cursor}/{questions.length}</span></div><progress className="w-full accent-violet-600" value={cursor} max={questions.length} aria-label="Actividades completadas"/></div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <label className="flex flex-wrap items-center gap-3 text-sm font-bold">Dificultad
              <select aria-label="Dificultad de las actividades pendientes" value={attempt.difficulty} onChange={event => changeDifficulty(event.target.value)} disabled={busy || !open} className="rounded-lg border border-violet-300 bg-white p-2 disabled:opacity-50">
                <option value="beginner">Iniciación</option><option value="advanced">Más desafío</option>
              </select>
            </label>
            <p className="text-xs text-violet-900 mt-2">Puedes cambiar el nivel sin perder tus respuestas. Se aplicará a las actividades que todavía no hayas respondido.</p>
            {currentAnswer && current.difficulty !== attempt.difficulty && <p className="text-xs font-bold text-violet-900 mt-2">Esta actividad ya respondida conserva su nivel: {current.difficulty === 'advanced' ? 'Más desafío' : 'Iniciación'}. El nivel nuevo se usará al avanzar.</p>}
          </div>
          <label className="flex items-center gap-3 text-xs font-bold"><Volume2 className="w-4 h-4"/> Volumen <input type="range" min="0.1" max="1" step="0.05" value={volume} onChange={event => { stopAudio(); setVolume(Number(event.target.value)); }} className="accent-violet-600"/></label>
          {showLesson ? <><h3 className="text-xl font-black">{TEMPO_LESSONS[chapter].title}</h3>{TEMPO_LESSONS[chapter].paragraphs.map(paragraph => <p key={paragraph} className="text-sm leading-relaxed">{paragraph}</p>)}<div className="grid sm:grid-cols-2 gap-3">{TEMPO_LESSONS[chapter].demo.map((clip, index) => audioButton(clip, `lesson-${chapter}-${index}`, TEMPO_LESSONS[chapter].demoLabels[index]))}</div><button type="button" onClick={() => { stopAudio(); setShowLesson(false); }} className="w-full bg-black text-white rounded-xl py-4 font-bold">Vamos a practicar <ChevronRight className="w-4 h-4 inline"/></button></> : <>
            <p className="text-xs text-violet-700 font-black uppercase">Actividad {cursor + 1} de {questions.length}</p><h3 className="text-xl font-black">{current.prompt}</h3>
            <div className="grid sm:grid-cols-2 gap-3">{current.clips.map((clip, index) => audioButton(clip, `${current.id}-${index}`, current.clips.length > 1 ? `Escuchar versión ${index ? 'B' : 'A'}` : 'Escuchar fragmento'))}</div>
            <fieldset disabled={busy || hasFeedback} className="space-y-2"><legend className="sr-only">Elige una respuesta</legend>{current.options.map((option, index) => <label key={option} className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer ${selected === index ? 'border-violet-600 bg-violet-50' : 'border-zinc-200 bg-white'}`}><input type="radio" name={`answer-${current.id}`} checked={selected === index} onChange={() => setSelected(index)}/><span className="text-sm font-bold">{option}</span></label>)}</fieldset>
            {!hasFeedback && <><button type="button" onClick={() => setHint(true)} className="text-sm text-violet-700 font-bold underline"><Lightbulb className="w-4 h-4 inline"/> Necesito una pista</button>{hint && <p className="p-4 bg-amber-50 rounded-xl text-sm">{current.hint}</p>}<button type="button" onClick={submit} disabled={busy || selected === null || current.clips.some((_clip, index) => !heard[`${current.id}-${index}`])} className="w-full bg-black text-white rounded-xl py-4 font-bold disabled:opacity-40">{busy ? 'Guardando…' : 'Comprobar respuesta'}</button><p className="text-xs text-zinc-500">Escucha cada fragmento completo antes de responder.</p></>}
            {hasFeedback && <div className={`p-5 rounded-2xl border ${currentAnswer.correct ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`} role="status"><strong>{currentAnswer.correct ? '¡Bien reconocido!' : 'Vamos a escucharlo de otra manera'}</strong><p className="mt-2 text-sm leading-relaxed">{current.explanation}</p><p className="mt-2 text-xs">Respuesta: {current.options[current.correct]}</p><div className="flex flex-col sm:flex-row gap-3 mt-4">{!currentAnswer.correct && <button type="button" onClick={() => { setRetrying(true); setSelected(null); setHint(true); }} className="rounded-xl border border-amber-300 px-4 py-3 text-sm font-bold">Escuchar y probar otra vez</button>}<button type="button" onClick={next} disabled={busy} className="flex-1 rounded-xl bg-black text-white px-4 py-3 font-bold text-sm disabled:opacity-50">{busy ? 'Guardando…' : cursor === questions.length - 1 ? 'Terminar y ver resultado' : 'Continuar'}</button></div></div>}
            <button type="button" onClick={() => { stopAudio(); setShowLesson(true); }} className="text-xs text-violet-700 underline">Volver a la explicación</button>
          </>}
          <button type="button" onClick={close} disabled={busy} className="w-full rounded-xl border border-zinc-300 py-3 text-sm font-bold disabled:opacity-50">Guardar y continuar en otro momento</button>
        </>}
      </div>
    </div>
  </div>;
}
