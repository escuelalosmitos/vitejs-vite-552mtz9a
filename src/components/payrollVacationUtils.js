const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDate = value => String(value || '').trim().slice(0, 10);

const isMonthString = value => /^\d{4}-\d{2}$/.test(String(value || ''));

const shiftMonth = (month, amount) => {
  if (!isMonthString(month)) return '';
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const getLocalDayOfWeekFromDate = dateString => {
  const normalized = normalizeDate(dateString);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getDay();
};

/**
 * Calcula las vacaciones retribuidas con el mismo criterio para Admin y Teacher.
 *
 * - Solo computan las fechas que coinciden con una jornada habitual real.
 * - La jornada diaria se obtiene de los registros de los 11 meses completos
 *   anteriores al mes liquidado.
 * - Si todavía no existe historial, se usan las horas habituales programadas
 *   para cada fecha de vacaciones computable.
 */
export const calculateVacationPayroll = ({
  targetMonth = '',
  vacationDates = [],
  records = [],
  scheduledHoursByDate = {},
  historyMonths = 11
} = {}) => {
  if (!isMonthString(targetMonth)) {
    return {
      vacationDates: [],
      computableVacationDates: [],
      vacationDays: 0,
      averageDailyHours: 0,
      vacationHours: 0,
      calculationBasis: 'none',
      historyMonthsUsed: 0
    };
  }

  const normalizedVacationDates = [...new Set((vacationDates || [])
    .map(normalizeDate)
    .filter(date => date.startsWith(`${targetMonth}-`)))]
    .sort();

  const computableVacationDates = normalizedVacationDates.filter(date => (
    normalizeNumber(scheduledHoursByDate?.[date], 0) > 0
  ));

  const historyStartMonth = shiftMonth(targetMonth, -Math.max(1, Number(historyMonths) || 11));
  const historyEndMonth = shiftMonth(targetMonth, -1);
  const minutesByWorkedDate = new Map();

  (records || []).forEach(record => {
    if (record?.isRenounced) return;
    const recordDate = normalizeDate(record?.date);
    const recordMonth = recordDate.slice(0, 7);
    if (!recordDate || recordMonth < historyStartMonth || recordMonth > historyEndMonth) return;
    const duration = Math.max(0, normalizeNumber(record?.duration, 60));
    minutesByWorkedDate.set(recordDate, (minutesByWorkedDate.get(recordDate) || 0) + duration);
  });

  const totalHistoryMinutes = [...minutesByWorkedDate.values()].reduce((sum, minutes) => sum + minutes, 0);
  const workedDays = minutesByWorkedDate.size;
  const averageDailyHours = workedDays > 0 ? totalHistoryMinutes / workedDays / 60 : 0;
  const historyMonthsUsed = new Set([...minutesByWorkedDate.keys()].map(date => date.slice(0, 7))).size;

  const vacationHours = workedDays > 0
    ? computableVacationDates.length * averageDailyHours
    : computableVacationDates.reduce((sum, date) => sum + normalizeNumber(scheduledHoursByDate?.[date], 0), 0);

  return {
    vacationDates: normalizedVacationDates,
    computableVacationDates,
    vacationDays: computableVacationDates.length,
    averageDailyHours,
    vacationHours,
    calculationBasis: computableVacationDates.length === 0 ? 'none' : workedDays > 0 ? 'history' : 'schedule',
    historyMonthsUsed,
    historyStartMonth,
    historyEndMonth
  };
};

