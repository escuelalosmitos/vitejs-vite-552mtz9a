import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, Pause, CheckCircle, Lightbulb, Volume2 } from 'lucide-react';
import { getMusicGame } from './musicChallengeCatalog.js';
import { buildMusicQuestionsForAttempt, musicLessons, musicBuilderChecks, musicSubmissionClip } from './musicChallengeContent.js';
import { playMusicClip } from './musicChallengeAudio.js';
import { startMusicAttempt, saveMusicAttempt } from './musicChallengeStore.js';
import { isVacationChallengeOpen, recordVacationAnswer, summarizeVacationAnswers, readChallengeClock } from './vacationChallengeUtils.js';

function MusicAudioButton({ clip, clipKey, label, playing, heard, disabled, onToggle }) {
  return <button type="button" onClick={() => onToggle(clip, clipKey)} disabled={disabled} className={`flex items-center gap-2 p-3 sm:p-4 border rounded-xl text-left text-sm font-bold disabled:opacity-40 ${playing === clipKey ? 'bg-violet-100 border-violet-400' : 'bg-white border-zinc-200'}`}>
    {playing === clipKey ? <Pause className="w-4 h-4 shrink-0"/> : <Play className="w-4 h-4 shrink-0"/>}<span>{label}</span>{heard[clipKey] > 0 && <CheckCircle className="w-4 h-4 ml-auto text-emerald-600 shrink-0"/>}
  </button>;
}

export default function MusicChallengePlayer({ db, appId, user, student, dateStr, classData, vacationDates = [], session = {}, preview, onClose }) {
  const [attempt, setAttempt] = useState(session.attempt || null);
  const [difficulty, setDifficulty] = useState(session.attempt?.difficulty || preview?.difficulty || 'beginner');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLesson, setShowLesson] = useState(true);
  const [selected, setSelected] = useState(session.attempt?.answers?.[session.attempt.cursor]?.lastOption ?? null);
  const [submission, setSubmission] = useState(session.attempt?.answers?.[session.attempt.cursor]?.submission || []);
  const [retrying, setRetrying] = useState(false);
  const [hint, setHint] = useState(false);
  const [heard, setHeard] = useState({});
  const [playing, setPlaying] = useState('');
  const [volume, setVolume] = useState(0.65);
  const [clock, setClock] = useState(readChallengeClock);
  const audio = useRef(null), generation = useRef(0), lock = useRef(false), alive = useRef(true);
  const elapsedSince = useRef(readChallengeClock());
  const gameId = attempt?.challengeId || preview?.gameId || session.assignment?.challengeId;
  const game = getMusicGame(gameId);
  const questions = useMemo(() => attempt ? buildMusicQuestionsForAttempt(attempt) : [], [attempt]);
  const lessons = musicLessons(gameId);
  const cursor = attempt?.cursor || 0, current = questions[cursor], chapter = current?.chapter || 0;
  const answer = attempt?.answers?.[cursor], feedback = Boolean(answer && !retrying);
  const open = Boolean(preview) || isVacationChallengeOpen(dateStr, vacationDates, clock);
  const summary = summarizeVacationAnswers(attempt?.answers || []);
  const stop = () => { generation.current++; audio.current?.(); audio.current = null; setPlaying(''); };
  useEffect(() => {
    alive.current = true;
    const generationRef = generation, audioRef = audio;
    const timer = setInterval(() => setClock(readChallengeClock()), 1000);
    const hidden = () => { if (document.hidden) { generation.current++; audio.current?.(); audio.current = null; setPlaying(''); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', hidden); generationRef.current++; audioRef.current?.(); };
  }, []);
  useEffect(() => { if (!open) { generation.current++; audio.current?.(); audio.current = null; } }, [open]);
  const persist = async next => {
    if (lock.current || !open) return null;
    lock.current = true; setBusy(true); setError('');
    try {
      const elapsed = Math.min(300, Math.max(0, Math.floor((readChallengeClock() - elapsedSince.current) / 1000)));
      const payload = { ...next, elapsedSeconds: (attempt?.elapsedSeconds || 0) + elapsed };
      const saved = preview ? { ...payload, ...summarizeVacationAnswers(payload.answers), revision: (attempt?.revision || 0) + 1 } : await saveMusicAttempt({ db, appId, attempt: payload, expectedRevision: attempt.revision, vacationDates });
      elapsedSince.current = readChallengeClock(); if (alive.current) setAttempt(saved); return saved;
    } catch (failure) { if (alive.current) setError(failure.message || 'No se ha podido guardar. Vuelve a intentarlo.'); return null; }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const begin = async () => {
    if (lock.current || !open) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = preview ? { challengeId: game.id, challengeTitle: game.title, seed: preview.seed,
        contentVersion: 3, generatorVersion: 1, difficulty, totalActivities: game.total, sequenceOrdinal: 0,
        answers: [], cursor: 0, status: 'in_progress', revision: 0, elapsedSeconds: 0 } : await startMusicAttempt({
        db, appId, student: { ...student, email: user.email }, dateStr, classData, difficulty, previous: session.previous
      });
      if (saved.contentVersion !== 3) throw new Error('Otra pestaña ha iniciado una partida anterior. Cierra el reto y vuelve a abrirlo.');
      elapsedSince.current = readChallengeClock(); if (alive.current) setAttempt(saved);
    } catch (failure) { if (alive.current) setError(failure.message || 'No se ha podido iniciar el reto.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const listen = async (clip, key) => {
    stop(); setError(''); setPlaying(key); const token = generation.current;
    try {
      const cancel = await playMusicClip(clip, { volume, onEnd: () => {
        if (!alive.current || token !== generation.current) return;
        setPlaying(''); setHeard(previous => ({ ...previous, [key]: (previous[key] || 0) + 1 }));
      } });
      if (!alive.current || token !== generation.current) cancel(); else audio.current = cancel;
    } catch (failure) { if (alive.current && token === generation.current) { setPlaying(''); setError(failure.message || 'No se ha podido reproducir el sonido.'); } }
  };
  const completeBuilder = current?.kind === 'builder' && submission.length === current.length && submission.every(value => current.palette.includes(value));
  const listened = current?.clips.every((_clip, index) => heard[`${current.id}-${index}`]);
  const canSubmit = current && !busy && open && listened && (current.kind === 'builder' ? completeBuilder && (current.builder !== 'composer' || heard[`${current.id}-own`]) : selected !== null);
  const submit = async () => {
    if (!canSubmit || feedback) return;
    const builder = current.kind === 'builder';
    const correct = builder ? musicBuilderChecks(current, submission).every(check => check.ok) : selected === current.correct;
    const result = recordVacationAnswer(answer, builder ? { ...current, correct: correct ? 0 : 1 } : current, builder ? 0 : selected, {
      hintUsed: hint, listenCount: Object.entries(heard).filter(([key]) => key.startsWith(`${current.id}-`)).reduce((sum, [, value]) => sum + value, 0)
    });
    if (builder) { result.submission = [...submission]; result.firstSubmission = answer?.firstSubmission || [...submission]; }
    const answers = [...attempt.answers]; answers[cursor] = result;
    if (await persist({ ...attempt, answers })) { setRetrying(false); stop(); }
  };
  const next = async () => {
    if (!feedback) return;
    stop(); const nextCursor = cursor + 1;
    if (!await persist({ ...attempt, cursor: nextCursor, status: nextCursor === questions.length ? 'completed' : 'in_progress' })) return;
    setSelected(null); setSubmission([]); setRetrying(false); setHint(false); setHeard({});
    if (questions[nextCursor]?.chapter !== chapter) setShowLesson(true);
  };
  const changeDifficulty = async value => {
    if (!['beginner', 'advanced'].includes(value) || busy) return;
    if (!attempt) { setDifficulty(value); return; }
    stop(); if (!await persist({ ...attempt, difficulty: value })) return;
    setDifficulty(value);
    if (!answer) { setSelected(null); setSubmission([]); setHeard({}); setHint(false); setRetrying(false); }
  };
  const close = async () => {
    stop(); if (attempt && attempt.status !== 'completed' && open && !preview && !await persist(attempt)) return;
    onClose();
  };
  const changeCell = (index, value) => {
    stop(); const values = Array.from({ length: current.length }, (_, at) => submission[at] || ''); values[index] = value;
    setSubmission(values); setHeard(previous => ({ ...previous, [`${current.id}-own`]: 0 }));
  };
  const toggleAudio = (clip, key) => { if (playing === key) stop(); else void listen(clip, key); };
  const audioButton = (clip, key, label) => <MusicAudioButton key={key} clip={clip} clipKey={key} label={label} playing={playing} heard={heard} disabled={busy || !open} onToggle={toggleAudio}/>;
  const lesson = lessons[chapter];
  return <div role="dialog" aria-modal="true" aria-labelledby="music-game-title" className="fixed inset-0 z-[200] bg-black/70 p-2 sm:p-5 flex items-start sm:items-center justify-center overflow-y-auto">
    <div className="w-full max-w-3xl bg-zinc-50 text-slate-900 rounded-3xl my-3 shadow-2xl max-h-[94dvh] flex flex-col overflow-hidden">
      <header className="bg-violet-950 text-white p-5 sm:p-6 flex justify-between gap-4 shrink-0"><div><p className="text-xs text-violet-200">{preview ? 'Modo de prueba · No guarda resultados en CRM' : `Reto de vacaciones · ${dateStr.split('-').reverse().join('/')}`}</p><h2 id="music-game-title" className="text-xl sm:text-2xl font-black mt-1">{game?.title}</h2><p className="text-xs text-violet-200 mt-2">{preview ? 'Puedes probarlo sin límite de fecha.' : 'Disponible hasta las 23:59 de esa fecha · Hora de la escuela'}</p></div><button type="button" onClick={close} disabled={busy} aria-label="Guardar y cerrar reto" className="p-2 rounded-full self-start hover:bg-white/10 disabled:opacity-40"><X/></button></header>
      <div className="p-5 sm:p-7 overflow-y-auto space-y-5">
        {error && <div role="alert" className="p-4 bg-red-50 text-red-800 rounded-xl text-sm">{error}<button type="button" onClick={() => { stop(); onClose(); }} className="ml-3 underline font-bold">Cerrar y volver a cargar</button></div>}
        {!open ? <><h3 className="font-black">El plazo de este reto ha terminado</h3><p className="text-sm">Tus respuestas guardadas se conservan. En las próximas vacaciones podrás descubrir otro reto.</p><button onClick={close} className="rounded-xl bg-black text-white p-3">Volver a mis clases</button></> : !attempt ? <>
          <h3 className="text-xl font-black">{game?.title}</h3><p>{game?.description}</p><p className="text-sm">Una actividad opcional con explicaciones, pistas y {game?.total} misiones. Reserva aproximadamente media hora; la duración depende de tus escuchas y de tu ritmo. No necesitas instrumento ni micrófono.</p>
          <p className="text-sm">Usa un volumen cómodo. Puedes cambiar la dificultad durante el juego. Al volver a este juego en otra ocasión encontrarás nuevos ejercicios.</p>
          <label className="block font-bold text-sm">Dificultad <select aria-label="Dificultad inicial" value={difficulty} onChange={event => changeDifficulty(event.target.value)} className="ml-2 border rounded-xl p-3 bg-white"><option value="beginner">Iniciación</option><option value="advanced">Más desafío</option></select></label>
          <button type="button" onClick={begin} disabled={busy} className="w-full bg-black text-white rounded-xl p-4 font-black disabled:opacity-40">{busy ? 'Preparando…' : 'Empezar mi reto'}</button>
        </> : attempt.status === 'completed' ? <>
          <h3 className="text-2xl font-black">¡Reto completado!</h3><p>{game.description}</p>
          <div className="grid sm:grid-cols-3 gap-3">{[[summary.firstCorrect, gameId === 'composer-v1' ? 'Misiones resueltas al primer intento' : 'Aciertos iniciales'], [summary.finalCorrect, 'Resueltas tras repasar'], [summary.withHelp, 'Con ayuda o reintento']].map(([value, label]) => <div key={label} className="p-4 bg-white border rounded-xl"><strong className="text-2xl">{value}/{questions.length}</strong><p className="text-xs mt-2">{label}</p></div>)}</div>
          <p className="text-sm">{preview ? 'Esta prueba no se ha enviado a CRM.' : 'Tu resultado está guardado. En tu próxima fecha de vacaciones te esperará el siguiente juego.'} Es una actividad de aprendizaje, sin nota académica.</p><button type="button" onClick={close} className="w-full p-4 bg-black text-white rounded-xl font-bold">Cerrar reto</button>
        </> : <>
          <div className="text-xs font-bold flex justify-between"><span>{lesson?.title}</span><span>{cursor}/{questions.length}</span></div><progress aria-label="Actividades completadas" value={cursor} max={questions.length} className="w-full accent-violet-600"/>
          <label className="flex flex-wrap gap-2 items-center text-sm font-bold">Dificultad <select aria-label="Dificultad de las actividades pendientes" value={attempt.difficulty} onChange={event => changeDifficulty(event.target.value)} disabled={busy} className="border rounded-lg p-2 bg-white"><option value="beginner">Iniciación</option><option value="advanced">Más desafío</option></select></label>
          <p className="text-xs text-zinc-500">El cambio se aplica a las actividades sin responder. Las respondidas conservan su nivel y sus ejercicios.</p>
          {answer && current.difficulty !== attempt.difficulty && <p className="text-xs font-bold text-violet-700">Esta actividad conserva su nivel: {current.difficulty === 'advanced' ? 'Más desafío' : 'Iniciación'}.</p>}
          <label className="flex items-center gap-3 text-xs"><Volume2 className="w-4 h-4"/> Volumen <input aria-label="Volumen" type="range" min="0.1" max="1" step="0.05" value={volume} onChange={event => { stop(); setVolume(Number(event.target.value)); }}/></label>
          {showLesson ? <><h3 className="text-xl font-black">{lesson?.title}</h3>{lesson?.paragraphs.map(text => <p key={text} className="text-sm leading-relaxed">{text}</p>)}<div className="grid sm:grid-cols-2 gap-3">{lesson?.demo.map((clip, index) => audioButton(clip, `lesson-${chapter}-${index}`, lesson.demoLabels[index]))}</div><button type="button" onClick={() => { stop(); setShowLesson(false); }} className="w-full p-4 rounded-xl bg-black text-white font-bold">Vamos a practicar</button></> : <>
            <p className="text-xs text-violet-700 font-black">Actividad {cursor + 1} de {questions.length}</p><h3 className="text-xl font-black">{current.prompt}</h3>
            {current.objectives && <ul className="list-disc pl-5 text-sm space-y-1">{current.objectives.map(objective => <li key={objective}>{objective}</li>)}</ul>}
            <div className="grid sm:grid-cols-2 gap-3">{current.clips.map((clip, index) => audioButton(clip, `${current.id}-${index}`, current.clipLabels?.[index] || (current.clips.length > 1 ? `Escuchar versión ${String.fromCharCode(65 + index)}` : 'Escuchar fragmento')))}</div>
            {current.kind === 'builder' ? <fieldset disabled={busy || feedback} className="space-y-3"><legend className="text-sm font-bold mb-3">{current.builder === 'rhythm' ? 'Una casilla = medio pulso · ● sonido · — silencio' : 'Coloca un bloque en cada posición'}</legend>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">{Array.from({ length: current.length }, (_, index) => <label key={index} className="text-xs text-center font-bold">{index + 1}<select aria-label={`Posición ${index + 1}`} value={submission[index] || ''} onChange={event => changeCell(index, event.target.value)} className="block w-full border border-violet-300 rounded-xl p-3 bg-white mt-1 text-base"><option value="">…</option>{current.palette.map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}</div>
            </fieldset> : <fieldset disabled={busy || feedback} className="space-y-2"><legend className="sr-only">Elige una respuesta</legend>{current.options.map((option, index) => <label key={option} className={`flex gap-3 items-center rounded-xl p-4 border cursor-pointer ${selected === index ? 'bg-violet-50 border-violet-600' : 'bg-white border-zinc-200'}`}><input type="radio" name={`answer-${current.id}`} checked={selected === index} onChange={() => setSelected(index)}/><span className="text-sm font-bold">{option}</span></label>)}</fieldset>}
            {current.kind === 'builder' && completeBuilder && audioButton(musicSubmissionClip(current, submission), `${current.id}-own`, 'Escuchar mi construcción')}
            {!feedback ? <><button type="button" onClick={() => setHint(true)} className="text-sm text-violet-700 underline font-bold"><Lightbulb className="w-4 h-4 inline"/> Necesito una pista</button>{hint && <p className="p-4 rounded-xl bg-amber-50 text-sm">{current.hint}</p>}<button type="button" onClick={submit} disabled={!canSubmit} className="w-full p-4 bg-black text-white rounded-xl font-bold disabled:opacity-40">{busy ? 'Guardando…' : 'Comprobar respuesta'}</button><p className="text-xs text-zinc-500">Escucha completos todos los fragmentos{current.builder === 'composer' ? ' y tu composición' : ''} antes de comprobar.</p></> : <div role="status" className={`rounded-2xl border p-5 space-y-3 ${answer.correct ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <strong>{answer.correct ? '¡Misión resuelta!' : 'Vamos a revisarlo'}</strong><p className="text-sm">{current.explanation}</p>
              {current.kind === 'builder' ? <ul className="text-sm space-y-1">{musicBuilderChecks(current, answer.submission).map(check => <li key={check.label}>{check.ok ? '✓' : '○'} {check.label}</li>)}</ul> : <p className="text-sm">Respuesta: {current.options[current.correct]}</p>}
              <div className="flex flex-col sm:flex-row gap-3">{!answer.correct && <button type="button" onClick={() => { setRetrying(true); setSelected(null); setHint(true); }} className="border border-amber-300 rounded-xl p-3 font-bold text-sm">Probar otra vez</button>}<button type="button" onClick={next} disabled={busy} className="flex-1 bg-black text-white rounded-xl p-3 font-bold disabled:opacity-40">{busy ? 'Guardando…' : cursor === questions.length - 1 ? 'Terminar y ver resultado' : 'Continuar'}</button></div>
            </div>}
            <button type="button" onClick={() => { stop(); setShowLesson(true); }} className="text-xs underline text-violet-700">Volver a la explicación</button>
          </>}
          <button type="button" onClick={close} disabled={busy} className="w-full border rounded-xl p-3 text-sm font-bold disabled:opacity-40">Guardar y continuar en otro momento</button>
        </>}
      </div>
    </div>
  </div>;
}
