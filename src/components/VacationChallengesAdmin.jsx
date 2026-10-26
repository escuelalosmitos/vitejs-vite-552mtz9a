import { lazy, Suspense, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { MUSIC_GAMES, getMusicGame, normalizeMusicOrder, musicVacationCounts, musicSeed } from './musicChallengeCatalog.js';
import { getSchoolDate } from './vacationChallengeUtils.js';
const Player = lazy(() => import('./MusicChallengePlayer.jsx'));

export default function VacationChallengesAdmin({ db, appId, settings, onSaved }) {
  const [order, setOrder] = useState(() => normalizeMusicOrder(settings.musicChallengeOrder));
  const [selected, setSelected] = useState('tempo-v1');
  const [difficulty, setDifficulty] = useState('beginner');
  const [preview, setPreview] = useState(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [year, setYear] = useState(() => getSchoolDate().slice(0, 4));
  const counts = musicVacationCounts(settings.vacaciones, year);
  const years = [...new Set([getSchoolDate().slice(0, 4), ...(settings.vacaciones || []).map(date => date.slice(0, 4))])].sort();
  const move = (index, delta) => { const values = [...order]; [values[index], values[index + delta]] = [values[index + delta], values[index]]; setOrder(values); setMessage(''); };
  const save = async () => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'artifacts', appId, 'settings', 'global'), { musicChallengeOrder: order }, { merge: true });
      batch.set(doc(db, 'artifacts', appId, 'roleData', 'studentSettings'), { musicChallengeOrder: order }, { merge: true });
      await batch.commit(); onSaved(order); setMessage('Orden guardado. Se aplicará al iniciar nuevas partidas; las ya iniciadas se conservan.');
    } catch { setError('No se ha podido guardar el orden. Tus cambios siguen aquí para reintentarlo.'); }
    finally { setBusy(false); }
  };
  const openPreview = fresh => {
    const nextRound = fresh ? round + 1 : round; if (fresh) setRound(nextRound);
    setPreview({ gameId: selected, difficulty, seed: String(musicSeed(`admin|${selected}|${nextRound}`)), key: `${selected}-${nextRound}-${difficulty}` });
  };
  return <section aria-label="Retos musicales" className="space-y-6">
    <div><h3 className="text-xl font-black">Retos musicales</h3><p className="text-sm text-zinc-600 mt-2">Siete juegos en una secuencia personal y cíclica. Solo se ofrecen desde las tarjetas de vacaciones generales; los festivos no generan juegos.</p></div>
    <div className="bg-white border rounded-3xl p-5 sm:p-6 space-y-4">
      <h4 className="font-black">Probar los juegos</h4><p className="text-sm text-zinc-600">El mismo juego que utiliza el alumno, sin restricciones de fecha. El progreso de prueba permanece en esta ventana; no se guarda en Firebase, no avanza ninguna secuencia ni genera novedades en CRM.</p>
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm font-bold">Juego<select aria-label="Juego de prueba" value={selected} onChange={event => setSelected(event.target.value)} className="block w-full border rounded-xl p-3 mt-2 bg-white">{MUSIC_GAMES.map(game => <option key={game.id} value={game.id}>{game.title}</option>)}</select></label><label className="text-sm font-bold">Dificultad<select aria-label="Dificultad de prueba" value={difficulty} onChange={event => setDifficulty(event.target.value)} className="block w-full border rounded-xl p-3 mt-2 bg-white"><option value="beginner">Iniciación</option><option value="advanced">Más desafío</option></select></label></div>
      <p className="text-sm">{getMusicGame(selected).description}</p>
      <div className="flex flex-wrap gap-3"><button type="button" onClick={() => openPreview(false)} className="bg-black text-white rounded-xl px-5 py-3 font-bold text-sm">Probar desde el principio</button><button type="button" onClick={() => openPreview(true)} className="border rounded-xl px-5 py-3 font-bold text-sm">Generar otra variante y probar</button></div>
      <p className="text-xs text-zinc-500">«Probar desde el principio» repite los ejercicios de esta variante. «Generar otra» cambia el contenido. Puedes cambiar la dificultad dentro del juego.</p>
    </div>
    <div className="bg-white border rounded-3xl p-5 sm:p-6 space-y-4">
      <h4 className="font-black">Orden del catálogo</h4><p className="text-sm text-zinc-600">Después del último juego vuelve el primero, con ejercicios renovados. No se reinicia al cambiar de año. Al cambiar este orden, el siguiente reto será el que siga al último juego iniciado por cada alumno.</p>
      <ol className="space-y-2">{order.map((id, index) => <li key={id} className="flex items-center gap-3 border rounded-xl p-3"><span className="font-black text-violet-700">{index + 1}</span><span className="flex-1 text-sm font-bold">{getMusicGame(id).title}</span><button type="button" aria-label={`Subir ${getMusicGame(id).title}`} onClick={() => move(index, -1)} disabled={busy || index === 0} className="border rounded-lg px-3 py-2 disabled:opacity-30">↑</button><button type="button" aria-label={`Bajar ${getMusicGame(id).title}`} onClick={() => move(index, 1)} disabled={busy || index === order.length - 1} className="border rounded-lg px-3 py-2 disabled:opacity-30">↓</button></li>)}</ol>
      <button type="button" onClick={save} disabled={busy} className="bg-black text-white rounded-xl px-5 py-3 font-bold text-sm disabled:opacity-40">{busy ? 'Guardando…' : 'Guardar orden'}</button>
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-zinc-500">La secuencia avanza al pulsar «Empezar mi reto». Reabrir una partida recupera el mismo juego. Si queda incompleta, la siguiente fecha permite iniciar otro. Si no se inicia, no consume juego.</p>
    </div>
    <div className="bg-white border rounded-3xl p-5 sm:p-6 space-y-4"><div className="flex flex-wrap justify-between gap-3"><h4 className="font-black">Vacaciones por día de la semana</h4><select aria-label="Año del recuento de vacaciones" value={year} onChange={event => setYear(event.target.value)} className="border rounded-lg p-2 bg-white">{years.map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">{['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((day, index) => <div key={day} className="bg-violet-50 rounded-xl p-3 text-center"><strong className="block text-xl">{counts[(index + 1) % 7]}</strong><span className="text-xs">{day}</span></div>)}</div>
      <p className="text-sm">Máximo en un mismo día de la semana: <strong>{Math.max(...counts)}</strong>. Catálogo: <strong>7 juegos</strong>. {Math.max(...counts) > 7 ? 'Algún día de clase podría completar más de una vuelta en el año.' : 'El catálogo cubre ese máximo sin repetir para un alumno que empieza por el primero y mantiene una clase semanal.'}</p>
      <p className="text-xs text-zinc-500">Este recuento usa las fechas de vacaciones configuradas, sin festivos. No es una predicción individual: varias clases, cambios de horario y el historial personal pueden hacer que un alumno avance más.</p>
    </div>
    {preview && <Suspense fallback={<p role="status">Cargando el juego…</p>}><Player key={preview.key} preview={preview} onClose={() => setPreview(null)}/></Suspense>}
  </section>;
}
