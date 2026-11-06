import { buildMitoversoContractText, downloadMitoversoContract, MITOVERSO_ACCEPTANCE_TEXT } from './mitoversoContractUtils.js';

const readable = text => text.replace(/\[\*\*([^*]+)\*\*\]\(mailto:[^)]+\)/g, '$1').replace(/\*\*/g, '');

export function MitoversoContractDocument({ text = '', label = 'Texto completo del contrato Mitoverso' }) {
  return <article className="space-y-4 text-sm leading-relaxed text-slate-700" aria-label={label}>
    {text.split(/\n\s*\n/).map((block, index) => block.startsWith('#')
      ? <h3 key={index} className="font-black text-slate-950 text-base">{readable(block.replace(/^#+\s*/, ''))}</h3>
      : <p key={index} className="whitespace-pre-wrap break-words">{readable(block)}</p>)}
  </article>;
}

export default function MitoversoContractForm({ draft, onChange, disabled = false }) {
  if (!draft) return <p role="alert">Cierra esta ventana y vuelve a abrir el contrato.</p>;
  const change = patch => onChange({ ...draft, ...patch, accepted: false });
  return <section className="space-y-4 mb-5" aria-label="Identificación y aceptación del contrato Mitoverso">
    <p className="text-sm text-zinc-600">Confirma el nombre y apellidos legales. Administración los contrastará con la documentación de facturación antes de activar Mitoverso. No se solicita el DNI aquí.</p>
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
      <MitoversoContractDocument text={buildMitoversoContractText(draft)}/>
    </div>
    <button type="button" onClick={() => downloadMitoversoContract(draft)} className="text-xs underline font-bold">Descargar el contrato antes de aceptar</button>
    <label className="flex items-start gap-3 p-4 border rounded-xl cursor-pointer">
      <input type="checkbox" disabled={disabled} checked={draft.immediateStart === true} onChange={event => change({ immediateStart: event.target.checked })} className="mt-1 shrink-0"/>
      <span className="text-xs leading-relaxed">Solicito expresamente el inicio de Mitoverso durante los primeros 14 días, una vez revisado y activado por Administración. Conozco las condiciones de desistimiento de la cláusula 23. El mero acceso no supone una renuncia general a mis derechos. Esta opción es voluntaria; sin marcarla se esperará a que transcurran 14 días.</span>
    </label>
    <label className="flex items-start gap-3 p-4 border-2 border-blue-200 rounded-xl bg-blue-50 cursor-pointer">
      <input type="checkbox" disabled={disabled} checked={draft.accepted === true} onChange={event => onChange({ ...draft, accepted: event.target.checked })} className="mt-1 shrink-0"/>
      <span className="text-xs font-bold leading-relaxed">{MITOVERSO_ACCEPTANCE_TEXT}</span>
    </label>
    <p className="text-xs text-zinc-500">El documento se conserva en castellano y podrás descargar la copia aceptada desde Extras. Puedes corregir tus datos antes de enviar. El alta queda pendiente de revisión y confirmación.</p>
  </section>;
}
