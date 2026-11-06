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
    <div className="mt-2 text-xs text-zinc-300">
      <p className="break-all select-all">{email}</p>
      <button type="button" onClick={copyAddress} className="py-2 font-bold underline">Copiar dirección</button>
      <p role="status">{copyMessage}</p>
    </div>
  );
}

export default function TeacherContactCard({ contacts }) {
  const single = contacts.length === 1 ? contacts[0] : null;
  const actionClass = 'group block w-full rounded-[inherit] p-6 text-left transition-all hover:bg-zinc-800';
  const heading = (
    <span className="flex items-center justify-between gap-4">
      <span>
        <span className="block text-lg font-black uppercase tracking-tight text-white">Contactar con mi profesor</span>
        <span className="mt-1 block text-xs font-medium text-zinc-400">
          Escribe a tu profesor por correo para consultas sobre tus clases. El profesorado no tramita gestiones administrativas. Para esos trámites, usa «Dudas u otras gestiones».
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-zinc-800 p-4 transition-transform group-hover:scale-110">
        <Mail className="w-6 h-6 text-white" aria-hidden="true" />
      </span>
    </span>
  );

  return (
    <div className="col-span-1 sm:col-span-2 rounded-3xl border-2 border-black bg-black text-left text-white shadow-md">
      {contacts.length > 1 ? (
        <details className="rounded-[inherit]">
          <summary className={`${actionClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{heading}</summary>
          <ul className="space-y-3 px-6 pb-5">
            {contacts.map(({ key, name, email, classLabels }) => (
              <li key={key} className="rounded-2xl bg-zinc-800 p-3 text-sm">
                <p className="font-bold">{name}</p>
                <p className="text-xs text-zinc-300">{[...classLabels].join(' / ')}</p>
                {email ? (
                  <>
                    <a href={teacherMailto(email)} className="mt-2 inline-block font-bold underline">Escribir a {name}</a>
                    <TeacherAddress key={email} email={email} />
                  </>
                ) : <p className="mt-2 text-xs text-zinc-300">El correo de este profesor no está disponible.</p>}
              </li>
            ))}
          </ul>
        </details>
      ) : single?.email ? (
        <>
          <a href={teacherMailto(single.email)} className={actionClass}>{heading}</a>
          <div className="px-6 pb-4">
            <TeacherAddress key={single.email} email={single.email} />
          </div>
        </>
      ) : (
        <div className="p-6">
          {heading}
          <p className="mt-2 text-xs text-zinc-300">El correo de tu profesor no está disponible.</p>
        </div>
      )}
    </div>
  );
}
