import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { publicFormToday, getPublicEnrollmentClasses, filterPublicEnrollmentClasses } from './publicEnrollmentUtils.js';

const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const dateLabel = value => value ? value.split('-').reverse().join('/') : '';
export default function PublicEnrollmentView({ db, internalClassesBySelection = new Map(), onStudents, onConfigure }) {
  const [remote, setRemote] = useState({ phase: 'loading', payload: null, cached: true });
  const [retry, setRetry] = useState(0);
  const [today, setToday] = useState(publicFormToday);
  const [filters, setFilters] = useState({ center: '', instrument: '', day: '' });
  useEffect(() => {
    const timer = setInterval(() => setToday(publicFormToday()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => onSnapshot(doc(db, 'publicData', 'classAvailability'), { includeMetadataChanges: true }, snapshot => {
    setRemote({ phase: snapshot.exists() ? 'ready' : 'missing', payload: snapshot.exists() ? snapshot.data() : null, cached: snapshot.metadata.fromCache });
  }, () => setRemote({ phase: 'error', payload: null, cached: false })), [db, retry]);
  const classes = useMemo(() => getPublicEnrollmentClasses(remote.payload, today), [remote.payload, today]);
  const centers = [...new Set(classes.map(item => item.escuela))].sort((a, b) => a.localeCompare(b));
  const instruments = [...new Set(classes.filter(item => !filters.center || item.escuela === filters.center).map(item => item.instrumento))].sort((a, b) => a.localeCompare(b));
  const visible = filterPublicEnrollmentClasses(classes, filters);
  return <section aria-label="Disponibles en formulario" className="space-y-4">
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-2">
      <h3 className="font-black text-emerald-950">Disponibles en formulario</h3>
      <p className="text-sm text-emerald-950">Los mismos turnos y plazas que muestra el formulario público de inscripción. Incluye grupos en formación con plazas y excluye turnos llenos. Esta vista muestra la publicación actual de la web.</p>
      {remote.phase === 'ready' && <p className="text-xs font-bold text-emerald-800" role="status">{remote.cached ? 'Datos guardados en este dispositivo; esperando confirmación del servidor.' : 'Listado público sincronizado.'} {classes.length} turnos · {classes.reduce((sum, item) => sum + item.plazas, 0)} plazas libres.</p>}
    </div>
    {remote.phase === 'loading' && <p role="status" className="p-5 text-sm">Cargando las plazas del formulario…</p>}
    {remote.phase === 'missing' && <p role="status" className="p-5 rounded-xl bg-amber-50 text-amber-900 text-sm">Todavía no hay un listado de plazas publicado. El formulario público tampoco dispone de turnos.</p>}
    {remote.phase === 'error' && <div role="alert" className="p-5 rounded-xl bg-red-50 text-red-800 text-sm">No se ha podido consultar el listado público. <button type="button" onClick={() => { setRemote({ phase: 'loading', payload: null, cached: true }); setRetry(value => value + 1); }} className="font-bold underline">Reintentar</button></div>}
    {remote.phase === 'ready' && <>
      <div className="bg-white border rounded-2xl p-4 grid sm:grid-cols-3 gap-3">
        <label className="text-xs font-bold">Escuela<select aria-label="Escuela del formulario" value={filters.center} onChange={event => setFilters(previous => ({ ...previous, center: event.target.value, instrument: '' }))} className="block w-full border rounded-xl p-3 mt-1 bg-white"><option value="">Todas</option>{centers.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-xs font-bold">Instrumento<select aria-label="Instrumento del formulario" value={filters.instrument} onChange={event => setFilters(previous => ({ ...previous, instrument: event.target.value }))} className="block w-full border rounded-xl p-3 mt-1 bg-white"><option value="">Todos</option>{instruments.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-xs font-bold">Día<select aria-label="Día del formulario" value={filters.day} onChange={event => setFilters(previous => ({ ...previous, day: event.target.value }))} className="block w-full border rounded-xl p-3 mt-1 bg-white"><option value="">Todos</option>{[1, 2, 3, 4, 5, 6, 0].map(value => <option key={value} value={value}>{weekdays[value]}</option>)}</select></label>
      </div>
      <p className="text-xs text-zinc-600">Mostrando {visible.length} de {classes.length} turnos. Las plazas son las del formulario, incluidas las reservas que ya descuenta la publicación.</p>
      {!visible.length ? <div className="bg-white border border-dashed rounded-2xl p-8 text-center text-sm text-zinc-500">{classes.length ? 'No hay turnos que coincidan con estos filtros.' : 'No hay turnos con plazas disponibles en el formulario.'}</div> : <div className="grid admin-auto-cards gap-4">{visible.map((item, index) => {
        const internal = internalClassesBySelection.get(item.selectionId);
        return <article key={`${item.selectionId}-${index}`} className="bg-white border border-emerald-200 border-l-8 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex justify-between gap-2 text-sm font-black"><span>{item.horario}</span><span className="text-emerald-800 shrink-0">{item.plazas} libres</span></div>
          <h4 className="font-black uppercase text-sm">{item.instrumento}</h4><p className="text-xs font-bold text-slate-600">{item.escuela} · Grupo de {item.maxCap} personas</p>
          {item.precio && <p className="font-bold text-sm">{item.precio}</p>}
          {item.inicio && <p className="text-xs text-violet-800 font-bold">Inicio previsto: {dateLabel(item.inicio)}</p>}
          {item.detalles && <p className="text-xs text-slate-600 whitespace-pre-wrap">{item.detalles}</p>}
          {item.allowPrivateOpening && <p className="text-xs text-sky-800">Opción de empezar en particular: {item.privateOpeningPrice}</p>}
          {internal && <div className="mt-auto pt-2 flex flex-wrap gap-2"><button type="button" onClick={() => onStudents(internal)} className="px-3 py-2 bg-zinc-100 rounded-lg text-xs font-bold">Alumnos</button><button type="button" onClick={() => onConfigure(internal)} className="px-3 py-2 bg-zinc-100 rounded-lg text-xs font-bold">Configurar / Web</button></div>}
        </article>;
      })}</div>}
    </>}
  </section>;
}
