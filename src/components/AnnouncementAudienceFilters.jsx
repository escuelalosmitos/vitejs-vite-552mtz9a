import { BOARD_WEEKDAYS, normalizeBoardFilters } from './announcementAudienceUtils.js';

export default function AnnouncementAudienceFilters({ filters, onChange, centers, instruments, teachers, disabled = false }) {
  const selected = normalizeBoardFilters(filters);
  const toggle = (key, value) => onChange(normalizeBoardFilters({ ...selected,
    [key]: selected[key].includes(value) ? selected[key].filter(item => item !== value) : [...selected[key], value]
  }));
  const groups = [
    ['centers', 'Sede', centers], ['instruments', 'Instrumento', instruments],
    ['teachers', 'Profesor', teachers], ['weekdays', 'Día de la semana', BOARD_WEEKDAYS]
  ];
  return <div className="space-y-3 md:col-span-2">
    <p className="text-xs text-sky-900">Marca los criterios que necesites. Dentro de cada grupo se incluye cualquiera de los valores marcados. Una misma clase debe cumplir todos los grupos elegidos. Los grupos vacíos no restringen.</p>
    <div className="grid sm:grid-cols-2 gap-3">{groups.map(([key, label, options]) => <fieldset key={key} disabled={disabled} className="rounded-xl border border-sky-200 bg-white p-3 disabled:opacity-60">
      <legend className="px-1 text-xs font-black text-sky-900">{label}</legend>
      <div className="max-h-40 overflow-y-auto flex flex-wrap gap-2">{options.map(option => {
        const value = typeof option === 'string' ? option : option.value;
        const text = typeof option === 'string' ? option : option.label;
        return <label key={value} className="inline-flex items-center gap-2 border rounded-lg px-2 py-2 text-xs font-bold text-slate-700 cursor-pointer"><input type="checkbox" checked={selected[key].includes(value)} onChange={() => toggle(key, value)} className="accent-sky-600"/>{text}</label>;
      })}</div>
    </fieldset>)}</div>
    <p className="text-xs text-sky-800">Se calculan los destinatarios al guardar, según sus clases fijas activas y el horario vigente. No se incluyen recuperaciones ni incorporaciones pendientes.</p>
  </div>;
}
