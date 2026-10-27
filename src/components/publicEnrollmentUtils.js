// Espejo de la lista blanca y del filtro del formulario público de WordPress.
// La fuente es el documento publicado, no la ocupación interna ni una proyección.
export const publicFormToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};
export const getPublicFormStartDate = (startDate, dayNum, autoAdvanceStartDate, todayStr = publicFormToday()) => {
  const clean = /^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '')) ? String(startDate) : '';
  if (!clean || autoAdvanceStartDate !== true) return clean || null;
  const target = Number(dayNum);
  if (!Number.isInteger(target) || target < 0 || target > 6 || clean >= todayStr) return clean;
  const [year, month, day] = clean.split('-').map(Number);
  let cursor = new Date(year, month - 1, day), result = clean, safety = 0;
  while (!Number.isNaN(cursor.getTime()) && result < todayStr && safety < 120) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    next.setDate(1 + (target - next.getDay() + 7) % 7);
    cursor = next;
    result = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    safety++;
  }
  return result || clean;
};
export const getPublicEnrollmentClasses = (payload, today = publicFormToday()) => (Array.isArray(payload?.classes) ? payload.classes : []).map((item, index) => {
  const dayNum = Number(item.dayNum), autoAdvanceStartDate = item.autoAdvanceStartDate === true;
  return {
    selectionId: String(item.selectionId || '').trim() || `legacy-${index}`,
    escuela: String(item.escuela || '').trim(), instrumento: String(item.instrumento || '').trim(),
    horario: String(item.horario || '').trim(), dayNum, timeStr: String(item.timeStr || '').trim(),
    maxCap: Number(item.maxCap) || 0, plazas: Number(item.plazas) || 0,
    url: String(item.url || '').trim(), precio: String(item.precio || '').trim(), detalles: String(item.detalles || '').trim(),
    inicio: getPublicFormStartDate(item.inicio, dayNum, autoAdvanceStartDate, today), autoAdvanceStartDate,
    allowPrivateOpening: item.allowPrivateOpening === true,
    privateOpeningUrl: String(item.privateOpeningUrl || '').trim(),
    privateOpeningPrice: String(item.privateOpeningPrice || '120 €/mes').trim(),
    privateOpeningThreshold: Math.max(2, Number(item.privateOpeningThreshold) || 2)
  };
}).filter(item => item.escuela && item.instrumento && item.horario && Number.isInteger(item.dayNum)
  && item.dayNum >= 0 && item.dayNum <= 6 && item.maxCap > 0 && item.plazas > 0);

export const filterPublicEnrollmentClasses = (classes, { center = '', instrument = '', day = '' } = {}) => classes
  .filter(item => (!center || item.escuela === center) && (!instrument || item.instrumento === instrument) && (day === '' || item.dayNum === Number(day)))
  .sort((a, b) => a.escuela.localeCompare(b.escuela) || a.instrumento.localeCompare(b.instrumento)
    || (a.dayNum === 0 ? 7 : a.dayNum) - (b.dayNum === 0 ? 7 : b.dayNum) || a.timeStr.localeCompare(b.timeStr));
