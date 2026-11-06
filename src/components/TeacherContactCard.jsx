import { useState } from 'react';
import { Mail } from 'lucide-react';

const teacherMailto = email => `mailto:${encodeURIComponent(email).replace('%40', '@')}?subject=Consulta%20de%20clase`;

function TeacherAddress({ email }) {
  const [copyMessage, setCopyMessage] = useState('');
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopyMessage('Dirección copiada.');
    } catch {
      setCopyMessage('Selecciona y copia la dirección de correo que aparece arriba.');
    }
  };

  return (
    <div className="mt-2 text-xs text-zinc-600">
      <p className="break-all select-all">{email}</p>
      <button type="button" onClick={copyAddress} className="py-2 font-bold underline">Copiar dirección</button>
      <p role="status">{copyMessage}</p>
    </div>
  );
}

export default function TeacherContactCard({ contacts }) {
  const single = contacts.length === 1 ? contacts[0] : null;
  const heading = <>
    <span className="inline-flex items-center gap-3 align-middle font-black uppercase tracking-tight text-slate-800 group-hover:underline">
      <Mail className="w-6 h-6 shrink-0 text-blue-600" aria-hidden="true" />
      Contactar con mi profesor
    </span>
    <span className="mt-1 block text-xs font-medium text-zinc-600">
      Escribe a tu profesor por correo para consultas sobre tus clases. El profesorado no tramita gestiones administrativas. Para esos trámites, usa «Dudas u otras gestiones».
    </span>
  </>;

  return (
    <div className="col-span-1 sm:col-span-2 rounded-3xl border-2 border-zinc-100 bg-white p-6 shadow-sm">
      {contacts.length > 1 ? (
        <details>
          <summary className="group cursor-pointer">{heading}</summary>
          <ul className="mt-3 space-y-3">
            {contacts.map(({ key, name, email, classLabels }) => (
              <li key={key} className="rounded-2xl bg-zinc-50 p-3 text-sm">
                <p className="font-bold">{name}</p>
                <p className="text-xs text-zinc-600">{[...classLabels].join(' / ')}</p>
                {email ? (
                  <>
                    <a href={teacherMailto(email)} className="mt-2 inline-block font-bold text-blue-700 underline">Escribir a {name}</a>
                    <TeacherAddress key={email} email={email} />
                  </>
                ) : <p className="mt-2 text-xs text-zinc-600">Correo no configurado.</p>}
              </li>
            ))}
          </ul>
        </details>
      ) : single?.email ? (
        <>
          <a href={teacherMailto(single.email)} className="group block">{heading}</a>
          <TeacherAddress key={single.email} email={single.email} />
        </>
      ) : (
        <>
          {heading}
          <p className="mt-2 text-xs text-zinc-600">Tu clase aún no tiene un correo de profesor configurado.</p>
        </>
      )}
    </div>
  );
}
