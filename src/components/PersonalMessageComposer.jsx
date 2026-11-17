import { useState } from 'react';
import { X } from 'lucide-react';
import { sendPersonalMessages } from './personalMessagesStore.js';

export default function PersonalMessageComposer({ db, appId, user, recipients, onClose }) {
  const [messageId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const submit = async event => {
    event.preventDefault();
    if (sending || sent) return;
    setSending(true);
    setAttempted(true);
    setError('');
    try {
      await sendPersonalMessages({ db, appId, studentIds: recipients.map(student => student.id), messageId, title, body, sender: user.email });
      setSent(true);
    } catch {
      setError('El envío no se ha completado. Pulsa Reintentar para continuar sin duplicar los mensajes que ya se hayan entregado.');
    } finally { setSending(false); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Mensaje personal" className="fixed inset-0 z-[150] bg-black/70 p-4 flex items-center justify-center">
      <form onSubmit={submit} className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-3xl p-6 shadow-xl" aria-label="Enviar mensaje personal">
        <button type="button" onClick={onClose} disabled={sending} aria-label="Cerrar mensaje" className="absolute top-4 right-4 p-2 rounded-xl bg-zinc-100">
          <X className="w-4 h-4"/>
        </button>
        <h2 className="font-black text-xl pr-10">Mensaje personal</h2>
        <p className="text-sm text-zinc-600 mt-2">Se entregará en la bandeja de {recipients.length} alumno(s). Los alumnos podrán leerlo y no podrán responder.</p>
        <details className="my-3 text-xs">
          <summary className="cursor-pointer font-bold">Ver destinatarios</summary>
          <ul className="max-h-32 overflow-y-auto mt-2">
            {recipients.map(student => <li key={student.id}>{student.alias || student.name || 'Alumno'}</li>)}
          </ul>
        </details>
        {sent ? (
          <p role="status" className="my-5 rounded-xl bg-emerald-50 p-4 text-emerald-800 font-bold">Mensaje entregado.</p>
        ) : (
          <>
            <label className="block text-sm font-bold mt-4">
              Asunto
              <input required maxLength={100} disabled={attempted} value={title} onChange={event => setTitle(event.target.value)} className="mt-1 w-full border rounded-xl p-3 disabled:bg-zinc-100"/>
            </label>
            <label className="block text-sm font-bold mt-4">
              Mensaje
              <textarea required maxLength={1000} disabled={attempted} value={body} onChange={event => setBody(event.target.value)} rows={5} className="mt-1 w-full border rounded-xl p-3 disabled:bg-zinc-100"/>
            </label>
            <p className="text-right text-xs text-zinc-500 mt-1">{body.length}/1000</p>
            {error && <p role="alert" className="my-3 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={sending || !title.trim() || !body.trim()} className="mt-4 w-full rounded-xl bg-black text-white p-3 font-bold disabled:opacity-40">
              {sending ? 'Enviando…' : error ? 'Reintentar' : 'Enviar mensaje'}
            </button>
          </>
        )}
        {sent && <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl bg-black p-3 text-white font-bold">Cerrar</button>}
      </form>
    </div>
  );
}
