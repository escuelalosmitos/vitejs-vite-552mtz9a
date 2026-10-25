import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import {
  buildVacationAttemptId, vacationDeadlineMillis, getSchoolDate, getSchoolParts, schoolDateTimeMillis,
  isVacationChallengeOpen, isCalendarDate, createVacationAttempt, recordVacationAnswer,
  summarizeVacationAnswers, isUnreadVacationAttempt
} from '../src/components/vacationChallengeUtils.js';
import { buildTempoQuestions, TEMPO_LESSONS } from '../src/components/tempoChallengeContent.js';
import { playTempoClip } from '../src/components/tempoChallengeAudio.js';

test('las vacaciones terminan a medianoche de Madrid incluso con los cambios de hora', () => {
  for (const [date, end] of [
    ['2026-12-24', '2026-12-24T23:00:00.000Z'],
    ['2026-07-10', '2026-07-10T22:00:00.000Z'],
    ['2026-03-29', '2026-03-29T22:00:00.000Z'],
    ['2026-10-25', '2026-10-25T23:00:00.000Z']
  ]) {
    const deadline = vacationDeadlineMillis(date);
    assert.equal(new Date(deadline).toISOString(), end);
    assert.equal(isVacationChallengeOpen(date, [date], deadline - 1), true);
    assert.equal(isVacationChallengeOpen(date, [date], deadline), false);
  }
  assert.equal(getSchoolDate(Date.parse('2026-10-25T22:59:59Z')), '2026-10-25');
  assert.equal(getSchoolDate(Date.parse('2026-10-25T23:00:00Z')), '2026-10-26');
});

test('un festivo fuera de vacaciones no habilita un juego; se rechazan fechas imposibles', () => {
  assert.equal(isVacationChallengeOpen('2026-12-25', ['2026-12-28'], Date.parse('2026-12-20T12:00:00Z')), false);
  assert.equal(isCalendarDate('2026-02-29'), false);
  assert.equal(isCalendarDate('2028-02-29'), true);
  assert.equal(isCalendarDate('no-es-fecha'), false);
});

test('cada alumno tiene un intento por fecha, compartido por sus clases de ese día', () => {
  assert.equal(buildVacationAttemptId('noa', '2026-12-24'), 'noa_2026-12-24');
  assert.notEqual(buildVacationAttemptId('noa', '2026-12-24'), buildVacationAttemptId('noa', '2026-12-31'));
  assert.notEqual(buildVacationAttemptId('noa', '2026-12-24'), buildVacationAttemptId('otro', '2026-12-24'));
  assert.throws(() => buildVacationAttemptId('../otro', '2026-12-24'));
});

test('los dos niveles tienen 36 ejercicios únicos, cuatro capítulos y audios coherentes con sus respuestas', () => {
  assert.equal(TEMPO_LESSONS.length, 4);
  for (const level of ['beginner', 'advanced']) {
    const questions = buildTempoQuestions(level, '2026-12-24');
    assert.equal(questions.length, 36);
    assert.equal(new Set(questions.map(item => item.id)).size, 36);
    assert.deepEqual([...new Set(questions.map(item => item.chapter))], [0, 1, 2, 3]);
    for (const item of questions) {
      assert.ok(item.correct >= 0 && item.correct < item.options.length);
      assert.ok(item.explanation && item.hint && item.clips.length);
      if (item.id.startsWith('tempo-')) assert.equal(item.correct, item.clips[1].bpm > item.clips[0].bpm ? 1 : 0);
      if (item.id.startsWith('density-')) assert.equal(item.clips[0].bpm, item.clips[1].bpm);
      if (item.id.startsWith('property-')) assert.equal(item.clips[0].bpm, item.clips[1].bpm);
      for (const clip of item.clips) {
        assert.ok(clip.bpm >= 60 && clip.bpm <= 150);
        assert.ok(clip.gain > 0 && clip.gain <= 0.3);
        assert.ok(clip.beats >= 4 && clip.beats <= 10);
      }
    }
  }
});

test('el reintento conserva el primer resultado y diferencia ayuda de acierto inicial', () => {
  const question = buildTempoQuestions()[0];
  const first = recordVacationAnswer(null, question, 1 - question.correct, { listenCount: 2 });
  const second = recordVacationAnswer(first, question, question.correct, { hintUsed: true, listenCount: 4 });
  assert.equal(second.firstCorrect, false);
  assert.equal(second.correct, true);
  assert.equal(second.tries, 2);
  assert.deepEqual(summarizeVacationAnswers([second]), { answered: 1, firstCorrect: 0, finalCorrect: 1, withHelp: 1 });
});

test('los avisos se encienden sólo al terminar y se mantienen hasta que ese administrador los consulta', () => {
  const completion = { status: 'completed', completedAt: { seconds: 1798100000 }, adminSeenBy: {} };
  assert.equal(isUnreadVacationAttempt({ ...completion, status: 'in_progress' }, 'admin'), false);
  assert.equal(isUnreadVacationAttempt({ ...completion, completedAt: null }, 'admin'), false);
  assert.equal(isUnreadVacationAttempt(completion, 'admin'), true);
  assert.equal(isUnreadVacationAttempt({ ...completion, adminSeenBy: { admin: { seconds: 1798100001 } } }, 'admin'), false);
  assert.equal(isUnreadVacationAttempt({ ...completion, adminSeenBy: { otro: true } }, 'admin'), true);
});

const studentSource = await readFile('src/components/StudentPortal.jsx', 'utf8');
const selectorSource = studentSource.match(/const getNextClassScheduleInfo = ([\s\S]*?);\n\n  const getClassReferenceDateForStudent/)[1];
const classData = { id: 'jueves', dayOfWeek: 4, time: '18:00', sede: 'Reus' };
const selectorAt = (instant, vacationDates, holidays = []) => {
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } }
  return vm.runInNewContext(`(${selectorSource})`, {
    Date: Clock, getSchoolDate, getSchoolParts, schoolDateTimeMillis,
    isPunctualClass: () => false, getEffectiveClassForDate: item => item,
    globalSettings: { vacaciones: vacationDates }, schoolCalendar: [...vacationDates, ...holidays].map(date => ({ date })),
    getClassCenter: () => ({ id: 'reus' }), normalizeConfigId: value => value,
    formatLocalDateString: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  });
};

test('la tarjeta del jueves de vacaciones no desaparece al empezar su hora; cambia al terminar el día', () => {
  const dates = ['2026-12-24', '2026-12-31'];
  assert.equal(selectorAt('2026-12-24T20:00:00+01:00', dates)(classData, { forVacationCard: true }).dateStr, '2026-12-24');
  assert.equal(selectorAt('2026-12-25T00:00:00+01:00', dates)(classData, { forVacationCard: true }).dateStr, '2026-12-31');
  assert.equal(selectorAt('2027-01-01T00:00:00+01:00', dates)(classData, { forVacationCard: true }).dateStr, '2027-01-07');
});

test('la próxima clase presencial salta varias vacaciones y un festivo posterior', () => {
  const dates = ['2026-12-24', '2026-12-31'];
  const compute = selectorAt('2026-12-24T12:00:00+01:00', dates, ['2027-01-07']);
  assert.equal(compute(classData, { forVacationCard: true, skipNonTeachingDays: true, afterDate: '2026-12-24' }).dateStr, '2027-01-14');
});

test('cada horario recibe sólo las vacaciones que coinciden con su día de clase', () => {
  const compute = selectorAt('2026-12-23T12:00:00+01:00', ['2026-12-24', '2026-12-25']);
  assert.equal(compute(classData, { forVacationCard: true }).dateStr, '2026-12-24');
  assert.equal(compute({ ...classData, dayOfWeek: 5 }, { forVacationCard: true }).dateStr, '2026-12-25');
  assert.equal(compute({ ...classData, dayOfWeek: 1 }, { forVacationCard: true }).dateStr, '2026-12-28');
});

const storeSource = await readFile('src/components/vacationChallengeStore.js', 'utf8');
const ast = parse(storeSource, { ecmaVersion: 'latest', sourceType: 'module', range: true });
const saveNode = ast.body.find(item => item.type === 'ExportNamedDeclaration' && item.declaration?.declarations?.[0]?.id.name === 'saveVacationAttempt').declaration.declarations[0].init;
const saveExpression = storeSource.slice(...saveNode.range);
const baseAttempt = () => createVacationAttempt({ student: { id: 'noa', name: 'Noa', email: 'madre@example.com' }, dateStr: '2099-12-24', classData: { id: 'guitar', refPath: 'artifacts/app/users/elia/recurringClasses/guitar' }, difficulty: 'beginner' });
const makeStore = () => {
  let data = null;
  let count = 0;
  const save = vm.runInNewContext(`(${saveExpression})`, {
    isVacationChallengeOpen, summarizeVacationAnswers, VACATION_CHALLENGE_TOTAL: 36,
    vacationAttemptRef: (_db, _app, id, date) => ({ id: buildVacationAttemptId(id, date) }),
    serverTimestamp: () => ({ pendingTimestamp: true }),
    runTransaction: async (_db, callback) => {
      let pending;
      const result = await callback({
        get: async reference => ({ exists: () => data !== null, data: () => structuredClone(data), id: reference.id }),
        set: (_reference, payload) => { pending = payload; }
      });
      if (pending) {
        count++;
        data = { ...data, ...structuredClone(pending) };
        for (const key of ['startedAt', 'updatedAt', 'completedAt']) if (data[key]?.pendingTimestamp) data[key] = { seconds: count * 1000 };
      }
      return result;
    }
  });
  return { save: (attempt, revision = null) => save({ db: {}, appId: 'app', attempt, expectedRevision: revision, vacationDates: [attempt.vacationDate] }), get: () => data, count: () => count };
};

test('el guardado es idempotente al empezar y conserva startedAt al responder y pausar', async () => {
  const store = makeStore();
  const created = await store.save(baseAttempt());
  const started = store.get().startedAt;
  await store.save(baseAttempt());
  assert.equal(store.count(), 1);
  const answered = { ...created, answers: [recordVacationAnswer(null, buildTempoQuestions()[0], 0)] };
  const saved = await store.save(answered, created.revision);
  assert.deepEqual(store.get().startedAt, started);
  await store.save(saved, saved.revision);
  assert.deepEqual(store.get().startedAt, started);
});

test('una pestaña obsoleta no sobreescribe el progreso de otra', async () => {
  const store = makeStore();
  const first = await store.save(baseAttempt());
  await store.save(first, 0);
  await assert.rejects(store.save(first, 0), /otra pestaña/);
  assert.equal(store.get().revision, 1);
});

test('no se puede completar con respuestas pendientes ni reabrir un intento completado', async () => {
  const store = makeStore();
  const first = await store.save(baseAttempt());
  await assert.rejects(store.save({ ...first, status: 'completed', cursor: 36 }, 0), /pendientes/);
  const answers = buildTempoQuestions().map(item => recordVacationAnswer(null, item, item.correct));
  const completed = await store.save({ ...first, status: 'completed', cursor: 36, answers }, 0);
  assert.equal(store.get().firstCorrect, 36);
  await assert.rejects(store.save(completed, completed.revision), /completado/);
});

test('el sintetizador reproduce pulsos y notas y libera el audio al detener o finalizar', async () => {
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const created = [];
  let closed = 0;
  let ended = 0;
  class Context {
    currentTime = 0; destination = {};
    resume = async () => {};
    close = async () => { closed++; };
    createGain = () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } });
    createOscillator = () => { const oscillator = { frequency: {}, connect() {}, start(at) { this.at = at; }, stop() { this.stopped = true; } }; created.push(oscillator); return oscillator; };
  }
  try {
    globalThis.window = { AudioContext: Context };
    globalThis.setTimeout = () => 1;
    globalThis.clearTimeout = () => {};
    const clip = buildTempoQuestions()[0].clips[0];
    const stop = await playTempoClip(clip, { onEnd: () => ended++ });
    assert.equal(created.length, 16);
    assert.equal(ended, 0);
    stop(); assert.equal(ended, 0); assert.equal(closed, 1);
    await playTempoClip(clip, { onEnd: () => ended++ });
    created.at(-1).onended(); assert.equal(ended, 1); assert.equal(closed, 2);
  } finally {
    globalThis.window = originalWindow; globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout;
  }
});
