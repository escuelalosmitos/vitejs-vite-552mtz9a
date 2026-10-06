import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGymusikReservationId,
  canCancelGymusikReservationWithCredit,
  getGymusikCreditsRemaining,
  normalizeGymusikConfig
} from '../src/components/gymusikUtils.js';

test('Gymusik normaliza su configuración económica y operativa', () => {
  const config = normalizeGymusikConfig({ studentPrice: '20', externalPrice: '35', monthlyCredits: '4', minimumMembers: '6' });
  assert.equal(config.studentPrice, 20);
  assert.equal(config.externalPrice, 35);
  assert.equal(config.monthlyCredits, 4);
  assert.equal(config.minimumMembers, 6);
});

test('las reservas y la espera comprometen crédito, pero una cancelación a tiempo lo devuelve', () => {
  const reservations = [
    { studentId: 'alumno-1', sessionDate: '2026-10-03', status: 'confirmed' },
    { studentId: 'alumno-1', sessionDate: '2026-10-10', status: 'waitlist' },
    { studentId: 'alumno-1', sessionDate: '2026-10-17', status: 'cancelled', creditConsumed: false },
    { studentId: 'alumno-1', sessionDate: '2026-10-24', status: 'cancelled', creditConsumed: true }
  ];
  assert.equal(getGymusikCreditsRemaining({ reservations, studentId: 'alumno-1', month: '2026-10', monthlyCredits: 4 }), 1);
});

test('el plazo de cancelación se calcula desde la hora real de la sesión', () => {
  const session = { date: '2026-10-10', time: '12:00' };
  assert.equal(canCancelGymusikReservationWithCredit({ session, now: new Date('2026-10-09T10:00:00'), cancellationHours: 24 }), true);
  assert.equal(canCancelGymusikReservationWithCredit({ session, now: new Date('2026-10-09T13:00:00'), cancellationHours: 24 }), false);
});

test('el identificador de reserva termina en el alumno y es estable', () => {
  assert.equal(buildGymusikReservationId('Sesión 1', 'Alumno 9'), 'sesion-1_alumno-9');
});

