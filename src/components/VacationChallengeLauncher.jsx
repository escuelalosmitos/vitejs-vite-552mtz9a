import { lazy, Suspense, useEffect, useState } from 'react';
import { loadMusicSession } from './musicChallengeStore.js';
const LegacyPlayer = lazy(() => import('./VacationChallengePlayer.jsx'));
const MusicPlayer = lazy(() => import('./MusicChallengePlayer.jsx'));

export default function VacationChallengeLauncher(props) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    loadMusicSession(props.db, props.appId, props.student.id, props.dateStr).then(data => {
      if (active) setSession(data);
    }).catch(() => { if (active) setError('No se ha podido cargar tu reto. Comprueba la conexión y que las reglas estén actualizadas.'); });
    return () => { active = false; };
  }, [props.db, props.appId, props.student.id, props.dateStr, retry]);
  const loading = <div role="dialog" aria-modal="true" aria-label="Cargar reto" className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-5"><div className="bg-white rounded-2xl p-6 space-y-4 text-slate-900"><p>{error || 'Preparando tu reto musical…'}</p>{error && <button type="button" onClick={() => { setError(''); setRetry(value => value + 1); }} className="underline font-bold mr-4">Reintentar</button>}<button type="button" onClick={props.onClose} className="underline">Cerrar</button></div></div>;
  if (!session) return loading;
  return <Suspense fallback={loading}>{session.attempt && session.attempt.contentVersion !== 3 ? <LegacyPlayer {...props}/> : <MusicPlayer {...props} session={session}/>}</Suspense>;
}
