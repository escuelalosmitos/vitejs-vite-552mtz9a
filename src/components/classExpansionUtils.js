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

export const isFutureExpansionClass = (clase = {}, today = '') => (
  isExpansionDate(today) && isExpansionDate(clase.startDate) && clase.startDate >= today
  && clase.autoAdvanceStartDate !== true && clase.isWebVisible === true
  && clase.isRecurring !== false && !clase.date && !clase.specificDate
  && Boolean(String(clase.teacher || '').trim())
  && !/^sin\s+asignar$/i.test(String(clase.teacher || '').trim())
  && Boolean(getExpansionStartDate(clase, today))
);

export const isClassExpansionAvailable = (clase = {}, { today = '', activeCount = 0, committedCount = 0 } = {}) => {
  const capacity = Number(clase.capacity);
  if (clase.autoAdvanceStartDate === true || clase.isRecurring === false || clase.date || clase.specificDate) return false;
  if (!Number.isFinite(capacity) || capacity <= 0 || Number(committedCount) >= capacity) return false;
  return Number(activeCount) > 0 || isFutureExpansionClass(clase, today);
};

export const getExpansionDateError = (clase = {}, date = '', today = '') => {
  if (!isExpansionDate(date)) return 'Indica una fecha válida con formato AAAA-MM-DD.';
  if (!isExpansionDate(today) || date < today) return 'La incorporación no puede ser anterior a hoy.';
  if (isExpansionDate(clase.startDate) && date < clase.startDate) return 'La incorporación no puede ser anterior a la apertura de la clase.';
  if (new Date(`${date}T12:00:00Z`).getUTCDay() !== Number(clase.dayOfWeek)) return 'La fecha elegida no coincide con el día de esta clase.';
  return '';
};
