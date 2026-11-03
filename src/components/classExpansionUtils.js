import { getPublicEnrollmentClasses } from './publicEnrollmentUtils.js';

// Same stable identity as the public publisher; never match by instrument/time alone.
export const buildPublicClassSelectionId = (value = '') => {
  const source = String(value || '').trim();
  if (!source) return '';
  let hashA = 2166136261, hashB = 5381;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 16777619);
    hashB = Math.imul(hashB, 33) ^ code;
  }
  return `class-${(hashA >>> 0).toString(36)}-${(hashB >>> 0).toString(36)}`;
};

export const compareClassWeekdayAndTime = (a = {}, b = {}) => {
  const day = value => Number(value) === 0 ? 7 : Number(value);
  const minutes = value => {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : Infinity;
  };
  return day(a.dayOfWeek) - day(b.dayOfWeek) || minutes(a.time) - minutes(b.time)
    || String(a.sede || '').localeCompare(String(b.sede || ''), 'es')
    || String(a.publicSelectionId || a.refPath || a.id || '').localeCompare(String(b.publicSelectionId || b.refPath || b.id || ''));
};

export const getPublicExpansionClasses = (payload, catalog = [], ownClasses = [], today = '', instrument = '') => {
  const bySelection = new Map();
  for (const clase of catalog) {
    const key = buildPublicClassSelectionId(clase.refPath || clase.id);
    const previous = bySelection.get(key) || [];
    if (!previous.some(item => (item.refPath || item.id) === (clase.refPath || clase.id))) previous.push(clase);
    bySelection.set(key, previous);
  }
  const owned = new Set(ownClasses.flatMap(clase => {
    if (clase.refPath) return [buildPublicClassSelectionId(clase.refPath)];
    const matches = catalog.filter(item => String(item.id || item.docId) === String(clase.id || clase.docId));
    return matches.length === 1 ? [buildPublicClassSelectionId(matches[0].refPath || matches[0].id)] : [];
  }));
  return getPublicEnrollmentClasses(payload, today)
    .filter(row => (!instrument || row.instrumento === instrument) && !owned.has(row.selectionId))
    .map(row => {
      const matches = bySelection.get(row.selectionId) || [];
      const internal = matches.length === 1 ? matches[0] : null;
      return {
        ...(internal || {}), id: internal?.id || row.selectionId, refPath: internal?.refPath || '',
        publicSelectionId: row.selectionId, publicMappingReady: Boolean(internal?.refPath), publicFreeSpots: row.plazas,
        publicHorario: row.horario, subject: row.instrumento, sede: row.escuela, dayOfWeek: row.dayNum,
        time: row.timeStr || internal?.time || '', capacity: row.maxCap, price: row.precio,
        startDate: row.inicio || '', autoAdvanceStartDate: row.autoAdvanceStartDate, publicDetails: row.detalles
      };
    }).sort(compareClassWeekdayAndTime);
};

// Matches the public publisher's committed-seat rule at the offered opening date.
export const isPublicExpansionSeat = (entry = {}, student = {}, date = '') => {
  const type = String(entry.type || '').trim().toLowerCase(), status = String(entry.status || '').trim().toLowerCase();
  if (entry.isRecovery === true || entry.isTemporary === true || entry.isPunctual === true
    || entry.isTemporaryRelocation === true || entry.temporaryRelocationId
    || ['recovery', 'temporary', 'punctual', 'temporary_relocation'].includes(type)
    || ['recovery', 'baja', 'cancelled', 'canceled', 'deleted', 'eliminado'].includes(status)
    || String(student.globalStatus || '').trim().toLowerCase() === 'baja') return false;
  const rawUntil = String(entry.classEndDate || entry.scheduledEndDate || entry.endDate || student.classEndDate || student.scheduledEndDate || student.endDate || '').trim();
  const iso = rawUntil.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = rawUntil.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const until = iso ? `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
    : dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : '';
  return !(until && date && until < date);
};

export const getPublishedExpansionClass = (payload, clase, today) => getPublicEnrollmentClasses(payload, today)
  .find(row => row.selectionId === buildPublicClassSelectionId(clase.refPath || clase.id)) || null;

// Civil school dates: no dependency on the browser timezone.
export const isExpansionDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const getExpansionStartDate = (clase = {}, today = '') => {
  if (!isExpansionDate(today)) return '';
  const opening = isExpansionDate(clase.startDate) ? clase.startDate : '';
  const from = opening && opening > today ? opening : today;
  const day = Number(clase.dayOfWeek);
  if (!Number.isInteger(day) || day < 0 || day > 6) return '';
  const date = new Date(`${from}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (day - date.getUTCDay() + 7) % 7);
  return date.toISOString().slice(0, 10);
};

export const getExpansionDateError = (clase = {}, date = '', today = '') => {
  if (!isExpansionDate(date)) return 'Indica una fecha válida con formato AAAA-MM-DD.';
  if (!isExpansionDate(today) || date < today) return 'La incorporación no puede ser anterior a hoy.';
  if (isExpansionDate(clase.startDate) && date < clase.startDate) return 'La incorporación no puede ser anterior a la apertura de la clase.';
  if (new Date(`${date}T12:00:00Z`).getUTCDay() !== Number(clase.dayOfWeek)) return 'La fecha elegida no coincide con el día de esta clase.';
  return '';
};
