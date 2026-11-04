import { buildMitoboxContractText, downloadMitoboxContract, MITOBOX_ACCEPTANCE_TEXT } from './mitoboxContractUtils.js';

const readable = text => text.replace(/\[\*\*([^*]+)\*\*\]\(mailto:[^)]+\)/g, '$1').replace(/\*\*/g, '');

export function MitoboxContractDocument({ text = '' }) {
  return <article className="space-y-4 text-sm leading-relaxed text-slate-700" aria-label="Texto completo del contrato Mitobox">
    {text.split(/\n\s*\n/).map((block, index) => block.startsWith('#')
      ? <h3 key={index} className="font-black text-slate-950 text-base">{readable(block.replace(/^#+\s*/, ''))}</h3>
      : <p key={index} className="whitespace-pre-wrap break-words">{readable(block)}</p>)}
  </article>;
}

export default function MitoboxContractForm({ draft, onChange, disabled = false }) {
  if (!draft) return <p role="alert">Cierra esta ventana y vuelve a abrir el contrato.</p>;
  const change = patch => onChange({ ...draft, ...patch, accepted: false });
  return <section className="space-y-4 mb-5" aria-label="Identificación y aceptación del contrato Mitobox">
    <p className="text-sm text-zinc-600">Confirma el nombre y apellidos legales. Administración los contrastará con la documentación de facturación antes de activar Mitobox. No se solicita el DNI aquí.</p>
    <label className="block text-xs font-black">Actúo como
      <select disabled={disabled} value={draft.role} onChange={event => change({ role: event.target.value, signerFullName: event.target.value === 'adult' ? draft.studentFullName : '' })} className="block w-full mt-1 p-3 border rounded-xl font-medium">
        <option value="adult">Usuario mayor de edad, en nombre propio</option><option value="guardian">Padre, madre o representante legal de un menor</option>
      </select>
    </label>
    <label className="block text-xs font-black">{draft.role === 'guardian' ? 'Nombre y apellidos del alumno menor' : 'Tu nombre y apellidos completos'}
      <input disabled={disabled} autoComplete="name" maxLength={160} value={draft.studentFullName} onChange={event => change({ studentFullName: event.target.value, ...(draft.role === 'adult' ? { signerFullName: event.target.value } : {}) })} className="block w-full mt-1 p-3 border rounded-xl font-medium"/>
    </label>
    {draft.role === 'guardian' && <label className="block text-xs font-black">Nombre y apellidos del representante que acepta
      <input disabled={disabled} maxLength={160} autoComplete="name" value={draft.signerFullName} onChange={event => change({ signerFullName: event.target.value })} className="block w-full mt-1 p-3 border rounded-xl font-medium"/>
    </label>}
    <p className="text-xs text-zinc-500 break-words">Cuenta: {draft.accountEmail}. Si esta cuenta corresponde a un menor, la aceptación debe realizarla su representante legal.</p>
    <div className="max-h-72 sm:max-h-96 overflow-y-auto border border-zinc-200 rounded-2xl p-4 bg-zinc-50" tabIndex={0}>
      <MitoboxContractDocument text={buildMitoboxContractText(draft)}/>
    </div>
    <button type="button" onClick={() => downloadMitoboxContract(draft)} className="text-xs underline font-bold">Descargar el contrato antes de aceptar</button>
    <label className="flex items-start gap-3 p-4 border rounded-xl cursor-pointer">
      <input type="checkbox" disabled={disabled} checked={draft.immediateStart === true} onChange={event => change({ immediateStart: event.target.checked })} className="mt-1 shrink-0"/>
      <span className="text-xs leading-relaxed">Solicito expresamente que Mitobox pueda comenzar durante los primeros 14 días, una vez aprobado por Administración. Si desisto, podré tener que abonar la parte proporcional ya prestada. Sé que, solo si el servicio contratado se ejecuta íntegramente durante ese plazo, perdería el desistimiento respecto de esa prestación. El mero inicio no supone una renuncia general. Esta opción es voluntaria. Sin marcarla, el servicio esperará a que transcurran 14 días.</span>
    </label>
    <label className="flex items-start gap-3 p-4 border-2 border-blue-200 rounded-xl bg-blue-50 cursor-pointer">
      <input type="checkbox" disabled={disabled} checked={draft.accepted === true} onChange={event => onChange({ ...draft, accepted: event.target.checked })} className="mt-1 shrink-0"/>
      <span className="text-xs font-bold leading-relaxed">{MITOBOX_ACCEPTANCE_TEXT}</span>
    </label>
    <p className="text-xs text-zinc-500">El documento se conserva en castellano y podrás descargar la copia aceptada desde Extras. Puedes corregir tus datos antes de enviar. El alta queda pendiente de revisión y confirmación.</p>
  </section>;
}
