import { useEffect, useState } from 'react';
import { enrollmentPromotions as promo, blackFriday2026Draft } from './enrollmentPromotions.js';

const inputClass = 'block w-full mt-1 p-3 border border-zinc-200 rounded-xl bg-white text-sm';
const labelClass = 'block text-xs font-bold text-slate-700';
const copy = value => JSON.parse(JSON.stringify(value));
export default function EnrollmentPromotionsAdmin({ campaigns, classes = [], groupSizes = [], centers = [], instruments = [], onSave }) {
  const [drafts, setDrafts] = useState(() => copy(Array.isArray(campaigns) ? campaigns.map(promo.normalize) : [blackFriday2026Draft()]));
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const current = drafts[selected];
  const change = patch => { setDrafts(values => values.map((item, i) => i === selected ? { ...item, ...patch } : item)); setMessage(''); };
  const toggle = (field, value) => change({ [field]: current[field]?.includes(value) ? current[field].filter(item => item !== value) : [...(current[field] || []), value] });
  const active = promo.active(drafts, now);
  const overlaps = drafts.filter(item => item.status === 'enabled').some((item, i, all) => all.slice(i + 1).some(other => item.startsAt <= other.endsAt && other.startsAt <= item.endsAt));
  const previewAt = current?.startsAt || now;
  const previewCampaign = current ? { ...promo.normalize(current), status: 'enabled' } : null;
  const exampleTurns = classes.flatMap(turn => [turn, ...(/^guitarra(?:\s+pequeñ[oa])?$/i.test(turn.instrumento) && turn.maxCap === 4 ? [{ ...turn, instrumento: 'Bajo' }, { ...turn, instrumento: 'Ukelele' }] : [])]);
  const preview = previewCampaign ? exampleTurns.filter(turn => promo.matches(previewCampaign, turn, turn.instrumento, 'group')) : [];
  const unpriced = preview.filter(turn => promo.monthlyCents(turn.precio) === null);
  const save = async () => {
    const values = drafts.map(promo.normalize);
    const invalid = values.map(item => promo.error(item)).find(Boolean);
    if (invalid) { setMessage(invalid); return; }
    if (values.length > 20) { setMessage('Se admiten hasta 20 campañas.'); return; }
    if (new Set(values.map(item => item.id)).size !== values.length) { setMessage('Hay campañas con la misma identidad.'); return; }
    const badPrice = values.filter(item => item.status === 'enabled').some(item => exampleTurns.some(turn => promo.matches(item, turn, turn.instrumento, 'group') && promo.monthlyCents(turn.precio) === null)
      || (item.modes.length === 0 || item.modes.includes('private')) && classes.some(turn => turn.allowPrivateOpening && promo.matches(item, turn, turn.instrumento, 'private') && promo.monthlyCents(turn.privateOpeningPrice || '120 €/mes') === null));
    if (badPrice) { setMessage('Hay turnos incluidos con tarifa no calculable. Corrige su precio web con el formato «60 €/mes» antes de habilitar la campaña.'); return; }
    const longSummary = values.filter(item => item.status === 'enabled').some(item => exampleTurns.some(turn => ['group', ...(turn.allowPrivateOpening ? ['private'] : [])].some(mode => {
      const offer = promo.quote([item], turn, turn.instrumento, mode, item.startsAt);
      return offer.eligible && !promo.summary(turn, turn.instrumento, mode, offer);
    })));
    if (longSummary) { setMessage('Un resumen supera los 1.000 caracteres de Tadosi. Abre la campaña y acorta sus condiciones breves para Tadosi antes de habilitarla.'); return; }
    setSaving(true); setMessage('');
    try { await onSave(values); setDrafts(values); setMessage('Campañas guardadas. Comprueba el estado de publicación de plazas antes de anunciar la oferta.'); }
    catch { setMessage('No se pudieron guardar las campañas. Conservamos los cambios para reintentar.'); }
    finally { setSaving(false); }
  };
  const options = (field, title, values) => <fieldset className="space-y-2"><legend className="text-xs font-black">{title}</legend><p className="text-xs text-zinc-500">Sin marcar opciones: todas.</p><div className="flex flex-wrap gap-3">{values.map(([value, label]) => <label key={value} className="text-xs inline-flex gap-2 items-center"><input type="checkbox" checked={current[field]?.includes(value) || false} onChange={() => toggle(field, value)} disabled={saving}/>{label}</label>)}</div></fieldset>;
  return <section aria-label="Promociones de inscripción" className="space-y-5">
    <div><h3 className="text-lg font-black">Promociones de inscripción</h3><p className="text-sm text-zinc-600 mt-2">Campañas para nuevas inscripciones. La promoción se ofrece activada por defecto y el visitante puede desactivarla. Solo los turnos y modalidades incluidos usan el descuento y el enlace común cuando el visitante se acoge a la oferta.</p><p className="text-xs text-zinc-500 mt-2">Tadosi recoge los datos y la domiciliación sin cobro inicial. La escuela contacta, confirma la plaza y prepara los recibos manualmente.</p></div>
    <p role="status" className="p-4 bg-blue-50 text-blue-950 rounded-xl text-sm">{active ? `Campaña activa según esta configuración: ${active.name}` : 'No hay campaña activa según esta configuración. Se usan los enlaces habituales.'} Las horas se interpretan en Europe/Madrid.</p>
    {overlaps && <p role="alert" className="p-4 rounded-xl bg-amber-50 text-amber-900 text-sm">Hay campañas con fechas coincidentes. Se aplica una sola: la de mayor prioridad; en empate, la que empieza más tarde y después su identificador. Los descuentos no se suman.</p>}
    <div className="flex flex-wrap gap-2">{drafts.map((item, i) => <button type="button" key={item.id} disabled={saving} aria-pressed={selected === i} onClick={() => setSelected(i)} className={`px-4 py-3 rounded-xl text-xs font-bold ${selected === i ? 'bg-black text-white' : 'bg-zinc-100'}`}>{item.name || 'Sin nombre'} · {promo.state(item, now)}</button>)}<button type="button" disabled={saving || drafts.length >= 20} onClick={() => { setDrafts(values => [...values, promo.normalize({ id: crypto.randomUUID(), name: 'Nueva promoción', modes: ['group'] })]); setSelected(drafts.length); }} className="px-4 py-3 border rounded-xl text-xs font-bold">Añadir campaña</button></div>
    {current && <div className="bg-white border rounded-2xl p-5 space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className={labelClass}>Nombre público<input className={inputClass} maxLength={100} value={current.name} onChange={e => change({ name: e.target.value })} disabled={saving}/></label>
        <label className={labelClass}>Estado<select className={inputClass} value={current.status} onChange={e => change({ status: e.target.value })} disabled={saving}><option value="draft">Borrador</option><option value="enabled">Habilitada según fechas</option><option value="paused">Pausada</option></select></label>
        <label className={labelClass}>Inscripciones desde<input type="datetime-local" className={inputClass} value={promo.madridInput(current.startsAt)} onChange={e => change({ startsAt: promo.madridMillis(e.target.value) })} disabled={saving}/></label>
        <label className={labelClass}>Inscripciones hasta (minuto incluido)<input type="datetime-local" className={inputClass} value={promo.madridInput(current.endsAt)} onChange={e => change({ endsAt: promo.madridMillis(e.target.value, true) })} disabled={saving}/></label>
        <label className={labelClass}>Tipo de descuento<select className={inputClass} value={current.discountType} onChange={e => change({ discountType: e.target.value })} disabled={saving}><option value="percent">Porcentaje</option><option value="fixed">Euros por mensualidad</option></select></label>
        <label className={labelClass}>Descuento<input type="number" min="0.01" max={current.discountType === 'percent' ? 100 : undefined} step="0.01" className={inputClass} value={current.discountValue || ''} onChange={e => change({ discountValue: e.target.value })} disabled={saving}/></label>
        <label className={labelClass}>Duración del descuento<select className={inputClass} value={current.durationType} onChange={e => change({ durationType: e.target.value })} disabled={saving}><option value="first_receipt">Primer recibo</option><option value="months">Primeras mensualidades</option><option value="until">Hasta una fecha</option><option value="ongoing">Mientras mantenga la inscripción</option></select></label>
        {current.durationType === 'months' && <label className={labelClass}>Número de mensualidades<input type="number" min="1" max="36" className={inputClass} value={current.durationMonths} onChange={e => change({ durationMonths: e.target.value })} disabled={saving}/></label>}
        {current.durationType === 'until' && <label className={labelClass}>Descuento hasta<input type="date" className={inputClass} value={current.benefitUntil} onChange={e => change({ benefitUntil: e.target.value })} disabled={saving}/></label>}
        <label className={labelClass}>Mes de incorporación (opcional)<input type="month" className={inputClass} value={current.intakeMonth} onChange={e => change({ intakeMonth: e.target.value })} disabled={saving}/></label>
        <label className={labelClass}>Mes inicial del descuento (opcional)<input type="month" className={inputClass} value={current.benefitStartMonth} onChange={e => change({ benefitStartMonth: e.target.value })} disabled={saving}/></label>
        <label className={labelClass}>Prioridad en caso de coincidencia<input type="number" min="0" max="999" className={inputClass} value={current.priority} onChange={e => change({ priority: e.target.value })} disabled={saving}/></label>
      </div>
      <label className={labelClass}>Enlace común de inscripción en Tadosi<input type="url" className={inputClass} placeholder="https://…" value={current.commonUrl} onChange={e => change({ commonUrl: e.target.value })} disabled={saving}/></label>
      <label className={labelClass}>Titular breve del anuncio<input className={inputClass} maxLength={300} value={current.subtitle} onChange={e => change({ subtitle: e.target.value })} disabled={saving}/></label>
      <label className={labelClass}>Condiciones completas visibles en la web<textarea className={inputClass} rows={5} maxLength={3000} value={current.conditions} onChange={e => change({ conditions: e.target.value })} disabled={saving}/></label>
      <label className={labelClass}>Calendario y condiciones de cobro<textarea className={inputClass} rows={3} maxLength={1000} value={current.billingText} onChange={e => change({ billingText: e.target.value })} disabled={saving}/></label>
      <label className={labelClass}>Permanencia de esta promoción (opcional)<textarea className={inputClass} rows={2} maxLength={1000} value={current.commitmentText} onChange={e => change({ commitmentText: e.target.value })} disabled={saving}/></label>
      <label className={labelClass}>Condiciones breves para el resumen de Tadosi (opcional)<textarea className={inputClass} rows={3} maxLength={500} value={current.summaryTerms} onChange={e => change({ summaryTerms: e.target.value })} disabled={saving}/><span className="block mt-1 text-xs font-normal text-zinc-500">Incluye cobros y permanencia sin repetir el precio calculado. Sustituye esos párrafos largos solo en el texto copiado; las condiciones completas siguen visibles en la web. Máximo total del resumen: 1.000 caracteres.</span></label>
      <div className="grid sm:grid-cols-2 gap-5">
        {options('centers', 'Sedes', centers.map(item => [item.name, item.name]))}
        {options('instruments', 'Instrumentos elegidos por el interesado', [...new Set([...instruments, 'Bajo', 'Ukelele'])].map(item => [item, item]))}
        {options('capacities', 'Tamaños de grupo', [...new Set([...groupSizes, ...classes.map(item => item.maxCap), ...(current.capacities || [])].map(Number).filter(value => Number.isInteger(value) && value > 0))].sort((a, b) => a - b).map(item => [String(item), `${item} personas`]))}
        {options('modes', 'Modalidades', [['group', 'Clases de grupo'], ['private', 'Particulares y apertura particular provisional']])}
        {options('days', 'Días', ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((name, i) => [String(i), name]))}
      </div>
      <details><summary className="text-sm font-bold cursor-pointer">Incluir o excluir turnos concretos</summary><p className="text-xs text-zinc-500 my-2">Si no incluyes ninguno expresamente, se aplican los demás filtros. Excluir prevalece sobre incluir.</p><div className="space-y-2">{classes.map(turn => <div key={turn.selectionId} className="flex flex-wrap gap-3 text-xs border-b py-2"><span className="flex-1 min-w-40">{turn.escuela} · {turn.instrumento} · {turn.horario} · {turn.maxCap}p</span><label><input type="checkbox" checked={current.selectionIds?.includes(turn.selectionId) || false} onChange={() => toggle('selectionIds', turn.selectionId)} disabled={saving}/> Incluir</label><label><input type="checkbox" checked={current.excludedSelectionIds?.includes(turn.selectionId) || false} onChange={() => toggle('excludedSelectionIds', turn.selectionId)} disabled={saving}/> Excluir</label></div>)}</div></details>
      <div className="bg-zinc-50 rounded-xl p-4 space-y-2"><h4 className="text-sm font-black">Vista previa al comienzo de esta campaña</h4><p className="text-xs text-zinc-600">{preview.length} opciones de instrumento y turno incluidas de las publicadas actualmente. La oferta web de plazas no cambia.</p>{unpriced.length > 0 && <p role="alert" className="text-xs text-red-700">{unpriced.length} tarifas necesitan revisión antes de habilitar.</p>}{preview.slice(0, 12).map(turn => { const q = promo.quote([previewCampaign], turn, turn.instrumento, 'group', previewAt); return <p key={`${turn.selectionId}-${turn.instrumento}`} className="text-xs">{turn.escuela} · {turn.instrumento} · {turn.horario}: <s>{q.baseLabel}</s> → <strong>{q.displayLabel || 'Precio pendiente'}</strong> {q.durationLabel}</p>; })}<p className="text-xs whitespace-pre-wrap">{current.conditions}</p></div>
    </div>}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={saving} onClick={save} className="bg-black text-white rounded-xl px-5 py-3 text-xs font-black disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar campañas'}</button>{current?.status === 'draft' && <button type="button" disabled={saving} onClick={() => { setDrafts(values => values.filter((_, i) => i !== selected)); setSelected(0); setMessage('Borrador retirado. Guarda las campañas para conservar el cambio.'); }} className="px-5 py-3 rounded-xl border text-xs font-bold">Retirar borrador</button>}</div>
    {message && <p role="status" className="text-sm p-4 bg-zinc-100 rounded-xl">{message}</p>}
  </section>;
}
