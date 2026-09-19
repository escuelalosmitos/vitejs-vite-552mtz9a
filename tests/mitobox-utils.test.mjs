import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMitoboxAvailability } from '../src/components/mitoboxUtils.js';

const center = {
  id: 'tarragona',
  name: 'Tarragona',
  holidays: [],
  rooms: [
    { id: 'sala-1', name: 'Sala 1', capacity: 2, active: true, mitoboxEnabled: true },
    { id: 'sala-2', name: 'Sala 2', capacity: 3, active: true, mitoboxEnabled: true }
  ]
};

const recurringClass = (overrides = {}) => ({
  id: 'class-1',
  isRecurring: true,
  dayOfWeek: 1,
  time: '17:00',
  duration: 60,
  centerId: 'tarragona',
  roomId: 'sala-1',
  mitoboxStudentCount: 1,
  cancelledDates: [],
  ...overrides
});

test('una clase recurrente ocupa su sala y permite compartir la sala libre hasta su aforo', () => {
  const date = '2026-09-21'; // lunes
  const slots = calculateMitoboxAvailability({ date, center, classes: [recurringClass()] });
  assert.deepEqual(slots.map(slot => [slot.time, slot.roomId, slot.freeSeats]), [
    ['17:00', 'sala-2', 3]
  ]);

  const withTwoReservations = calculateMitoboxAvailability({
    date,
    center,
    classes: [recurringClass()],
    slotUsage: [{ slotId: slots[0].slotId, reservedCount: 2 }]
  });
  assert.equal(withTwoReservations[0].freeSeats, 1);

  const full = calculateMitoboxAvailability({
    date,
    center,
    classes: [recurringClass()],
    slotUsage: [{ slotId: slots[0].slotId, reservedCount: 3 }]
  });
  assert.equal(full.length, 0);
});

test('una clase puntual solo bloquea su fecha exacta y añade su hora real', () => {
  const punctual = recurringClass({
    id: 'punctual-1',
    isRecurring: false,
    date: '2026-09-21',
    dayOfWeek: 0,
    time: '18:30',
    roomId: 'sala-2'
  });
  const exactDate = calculateMitoboxAvailability({
    date: '2026-09-21',
    center,
    classes: [recurringClass(), punctual]
  });
  assert.ok(exactDate.some(slot => slot.time === '18:30' && slot.roomId === 'sala-1'));
  assert.ok(!exactDate.some(slot => slot.time === '18:30' && slot.roomId === 'sala-2'));

  const followingMonday = calculateMitoboxAvailability({
    date: '2026-09-28',
    center,
    classes: [recurringClass(), punctual]
  });
  assert.ok(!followingMonday.some(slot => slot.time === '18:30'));
});

test('festivos, vacaciones y cierres locales eliminan todos los turnos', () => {
  const classes = [recurringClass()];
  assert.equal(calculateMitoboxAvailability({
    date: '2026-09-21', center, classes, settings: { festivos: ['2026-09-21'] }
  }).length, 0);
  assert.equal(calculateMitoboxAvailability({
    date: '2026-09-21', center, classes, settings: { vacaciones: ['2026-09-21'] }
  }).length, 0);
  assert.equal(calculateMitoboxAvailability({
    date: '2026-09-21', center: { ...center, holidays: ['2026-09-21'] }, classes
  }).length, 0);
});

test('los cambios temporales y recolocaciones alteran la ocupación sin publicar identidades', () => {
  const date = '2026-09-21';
  const source = recurringClass({ id: 'source', mitoboxStudentCount: 1 });
  const target = recurringClass({ id: 'target', time: '19:00', roomId: 'sala-2', mitoboxStudentCount: 0 });
  const relocation = {
    id: 'relocation-1',
    sourceClassId: 'source',
    targetClassId: 'target',
    from: date,
    until: date,
    status: 'active'
  };
  const temporaryChange = {
    id: 'change-1',
    classId: 'target',
    from: date,
    until: date,
    status: 'active',
    dayOfWeek: 1,
    time: '19:30',
    centerId: 'tarragona',
    roomId: 'sala-2',
    duration: 60
  };
  const slots = calculateMitoboxAvailability({
    date,
    center,
    classes: [source, target],
    temporaryRelocations: [relocation],
    temporaryClassChanges: [temporaryChange]
  });
  assert.ok(slots.some(slot => slot.time === '19:30' && slot.roomId === 'sala-1'));
  assert.ok(!slots.some(slot => slot.time === '19:30' && slot.roomId === 'sala-2'));
});

test('una clase larga bloquea reservas que se solapan aunque comiencen a otra hora', () => {
  const date = '2026-09-21';
  const longClass = recurringClass({ time: '17:30', duration: 90, roomId: 'sala-1' });
  const hourMarker = recurringClass({ id: 'marker', time: '18:00', duration: 60, roomId: 'sala-2' });
  const slots = calculateMitoboxAvailability({ date, center, classes: [longClass, hourMarker] });
  assert.ok(!slots.some(slot => slot.time === '18:00' && slot.roomId === 'sala-1'));
});
