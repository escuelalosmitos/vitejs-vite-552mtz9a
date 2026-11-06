import { MITOLOCKER_MODES } from './fixedServicesUtils.js';
import { MitoversoContractDocument } from './MitoversoContractForm.jsx';
import { buildMitolockerContractText, downloadMitolockerContract, mitolockerAcceptanceText, mitolockerModeLabel } from './mitolockerContractUtils.js';

export default function MitolockerContractForm({ draft, onChange, disabled }) {
  const change = patch => onChange({ ...draft, ...patch, accepted: false });

  return <div className="space-y-5 mb-5">
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 font-bold">Elige tu modalidad</legend>
      {Object.entries(MITOLOCKER_MODES).map(([mode, config]) => <label key={mode} className={`flex gap-3 border rounded-2xl p-4 cursor-pointer ${draft.mode === mode ? 'border-amber-500 bg-amber-50' : 'border-zinc-200'}`}>
        <input type="radio" name="mitolocker-mode" value={mode} checked={draft.mode === mode} onChange={() => change({ mode })} className="mt-1 self-start"/>
        <span><strong className="block text-sm">{mitolockerModeLabel(mode)}</strong><span className="text-sm text-zinc-600">{config.description}</span></span>
      </label>)}
    </fieldset>

    {draft.mode && <fieldset disabled={disabled} className="space-y-4">
      <label className="block text-sm font-bold">Instrumento o equipo que quieres dejar
        <input value={draft.instrument} onChange={event => change({ instrument: event.target.value })} maxLength={160} placeholder="Por ejemplo, guitarra eléctrica con funda" className="block w-full mt-1 p-3 border rounded-xl font-normal"/>
      </label>
      <label className="block text-sm font-bold">Quién acepta el contrato
        <select value={draft.role} onChange={event => change({ role: event.target.value, signerFullName: event.target.value === 'adult' ? draft.studentFullName : '' })} className="block w-full mt-1 p-3 border rounded-xl font-normal">
          <option value="adult">Mayor de edad, en nombre propio</option>
          <option value="guardian">Padre, madre o representante legal de un menor</option>
        </select>
      </label>
      <label className="block text-sm font-bold">{draft.role === 'guardian' ? 'Nombre y apellidos del alumno menor' : 'Tu nombre y apellidos'}
        <input value={draft.studentFullName} onChange={event => change({ studentFullName: event.target.value, ...(draft.role === 'adult' ? { signerFullName: event.target.value } : {}) })} maxLength={160} autoComplete="name" className="block w-full mt-1 p-3 border rounded-xl font-normal"/>
      </label>
      {draft.role === 'guardian' && <label className="block text-sm font-bold">Nombre y apellidos del representante
        <input value={draft.signerFullName} onChange={event => change({ signerFullName: event.target.value })} maxLength={160} autoComplete="name" className="block w-full mt-1 p-3 border rounded-xl font-normal"/>
      </label>}
      <p className="text-sm text-zinc-600">Si el alumno es menor, debe aceptar su representante legal. El alta queda pendiente de aprobación y disponibilidad. El resguardo se prepara al recibir el instrumento.</p>
      <div className="max-h-72 overflow-y-auto border rounded-2xl p-4 bg-zinc-50" tabIndex={0}>
        <MitoversoContractDocument text={buildMitolockerContractText(draft)} label="Texto completo del contrato Mitolocker"/>
      </div>
      <button type="button" onClick={() => downloadMitolockerContract(draft)} className="text-sm underline font-bold">Descargar el contrato</button>
      <label className="flex items-start gap-3 p-4 border-2 border-amber-200 rounded-xl bg-amber-50 cursor-pointer">
        <input type="checkbox" checked={draft.accepted} onChange={event => onChange({ ...draft, accepted: event.target.checked })} className="mt-1 shrink-0"/>
        <span className="text-sm font-bold">{mitolockerAcceptanceText(draft.mode)}</span>
      </label>
    </fieldset>}
  </div>;
}
