import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Mail, X } from 'lucide-react';

export default function StudentInbox({ db, appId, studentId, open, onToggle, onClose }) {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    return onSnapshot(collection(db, 'artifacts', appId, 'students', studentId, 'inboxMessages'), snapshot => {
      setMessages(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
      setLoading(false);
      setError('');
    }, () => { setLoading(false); setError('No se pudieron cargar tus mensajes.'); });
  }, [db, appId, studentId, retry]);
  const unread = messages.filter(message => !message.readAt).length;
  const markRead = async message => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId, 'inboxMessages', message.id), { readAt: serverTimestamp() });
    } catch { setError('No se pudo marcar el mensaje como leído. Vuelve a intentarlo.'); }
  };
  return (
    <>
      <button type="button" onClick={onToggle} aria-label="Abrir mensajes personales" aria-expanded={open}
        className={`relative p-2.5 rounded-xl transition-colors ${open ? 'bg-black text-white' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}>
        <Mail className="w-5 h-5"/>
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white border-2 border-white text-[9px] font-black flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <section aria-label="Bandeja de mensajes personales" className="absolute top-14 right-0 w-80 max-w-[calc(100vw-2rem)] bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden z-[70]">
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black uppercase text-slate-900">Mensajes personales</h2>
              <p className="text-[10px] text-zinc-500 mt-1">{unread} sin leer</p>
            </div>
            <button type="button" aria-label="Cerrar mensajes" onClick={onClose} className="p-2 bg-zinc-100 rounded-xl"><X className="w-4 h-4"/></button>
          </div>
          {error && (
            <div role="alert" className="p-4 text-xs text-red-700">
              {error}
              <button type="button" onClick={() => { setLoading(true); setError(''); setRetry(value => value + 1); }} className="block mt-2 underline">Reintentar carga</button>
            </div>
          )}
          <div className="max-h-[min(28rem,calc(100vh-10rem))] overflow-y-auto">
            {loading ? (
              <p role="status" className="p-6 text-sm text-zinc-500">Cargando mensajes…</p>
            ) : messages.length ? messages.map(message => (
              <article key={message.id} className="p-4 border-b border-zinc-100 last:border-b-0 flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0"><Mail className="w-4 h-4"/></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase text-zinc-400">Administración · {message.createdAt?.toDate?.().toLocaleDateString('es-ES') || 'Ahora'}</p>
                  <h3 className="font-black text-sm text-slate-900 mt-1 break-words">{message.title}</h3>
                  <p className="mt-1 text-xs text-zinc-600 whitespace-pre-wrap break-words">{message.body}</p>
                  {message.readAt ? (
                    <p className="mt-2 text-[10px] text-zinc-400">Leído</p>
                  ) : (
                    <button type="button" onClick={() => markRead(message)} className="mt-2 text-[10px] font-black uppercase underline">Marcar como leído</button>
                  )}
                </div>
              </article>
            )) : <p className="p-8 text-center text-xs font-bold text-zinc-500">Todavía no tienes mensajes personales.</p>}
          </div>
        </section>
      )}
    </>
  );
}
