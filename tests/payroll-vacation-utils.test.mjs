import assert from 'node:assert/strict';
import { calculateVacationPayroll } from '../src/components/payrollVacationUtils.js';

const almostEqual = (actual, expected) => {
  assert.ok(Math.abs(actual - expected) < 0.00001, `Esperado ${expected}; recibido ${actual}`);
};

// Norman trabaja los miércoles: unas vacaciones de jueves y viernes no computan.
{
  const result = calculateVacationPayroll({
    targetMonth: '2026-10',
    vacationDates: ['2026-10-01', '2026-10-02'],
    records: [{ date: '2026-09-23', duration: 240 }],
    scheduledHoursByDate: {}
  });
  assert.equal(result.vacationDays, 0);
  assert.equal(result.vacationHours, 0);
}

// Dos jornadas de vacaciones computables se valoran con la media diaria histórica.
{
  const result = calculateVacationPayroll({
    targetMonth: '2026-10',
    vacationDates: ['2026-10-01', '2026-10-02'],
    records: [
      { date: '2026-09-02', duration: 120 },
      { date: '2026-09-09', duration: 240 }
    ],
    scheduledHoursByDate: { '2026-10-01': 3, '2026-10-02': 2 }
  });
  assert.equal(result.vacationDays, 2);
  almostEqual(result.averageDailyHours, 3);
  almostEqual(result.vacationHours, 6);
  assert.equal(result.calculationBasis, 'history');
}

// Los registros anteriores a la ventana de once meses no alteran la media.
{
  const result = calculateVacationPayroll({
    targetMonth: '2026-10',
    vacationDates: ['2026-10-01'],
    records: [
      { date: '2025-10-01', duration: 600 },
      { date: '2025-11-01', duration: 120 },
      { date: '2026-09-01', duration: 240 }
    ],
    scheduledHoursByDate: { '2026-10-01': 1 }
  });
  almostEqual(result.averageDailyHours, 3);
  almostEqual(result.vacationHours, 3);
}

// Sin historial se usa la jornada habitual exacta de cada fecha.
{
  const result = calculateVacationPayroll({
    targetMonth: '2026-10',
    vacationDates: ['2026-10-01', '2026-10-02'],
    records: [],
    scheduledHoursByDate: { '2026-10-01': 2, '2026-10-02': 4 }
  });
  assert.equal(result.vacationDays, 2);
  almostEqual(result.vacationHours, 6);
  assert.equal(result.calculationBasis, 'schedule');
}

console.log('payroll-vacation-utils: ok');
