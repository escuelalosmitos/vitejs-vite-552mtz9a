import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import { spawnSync } from 'node:child_process';
import { TRIVIA_QUESTIONS as questions } from '../src/components/triviaQuestions.js';
import * as trivia from '../src/components/dailyTriviaUtils.js';
import { getSchoolDate, vacationDeadlineMillis } from '../src/components/vacationChallengeUtils.js';

const dayOffset = (date, offset) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
test('una pregunta común por fecha de Madrid y ciclo sin duplicados ni reinicio anual', () => {
  const first = trivia.getDailyTrivia(questions, '2026-10-28');
  assert.equal(first.poolSize, 362);
  assert.equal(first.question, questions[(301 * 137) % questions.length]);
  const cycle = Array.from({ length: first.poolSize }, (_, index) => trivia.getDailyTrivia(questions, dayOffset('2026-10-28', index)).question.q);
  assert.equal(new Set(cycle).size, first.poolSize);
  assert.equal(trivia.getDailyTrivia(questions, dayOffset('2026-10-28', first.poolSize)).question.q, cycle[0]);
  for (let offset = 0; offset < 5000; offset++) {
    const date = dayOffset('2024-01-01', offset);
    assert.notEqual(trivia.getDailyTrivia(questions, date).question.q, trivia.getDailyTrivia(questions, dayOffset(date, 1)).question.q);
  }
  assert.deepEqual(trivia.getDailyTrivia(questions, '2027-01-01'), trivia.getDailyTrivia(questions, '2027-01-01'));
});

test('el fallo antiguo se reproduce y la selección nueva es independiente de hora y zona del navegador', () => {
  const script = `
    import {getDailyTrivia} from './src/components/dailyTriviaUtils.js';
    import {getSchoolDate} from './src/components/vacationChallengeUtils.js';
    import {TRIVIA_QUESTIONS as q} from './src/components/triviaQuestions.js';
    const instants=['2026-10-24T10:00:00Z','2026-10-24T22:30:00Z','2026-10-25T23:30:00Z','2026-03-28T23:30:00Z','2026-03-29T22:30:00Z'];
    const old=iso=>{const n=new Date(iso);return Math.floor((n-new Date(n.getFullYear(),0,0))/86400000)};
    console.log(JSON.stringify({old:instants.slice(0,2).map(old),current:instants.map(iso=>getDailyTrivia(q,getSchoolDate(Date.parse(iso))))}));`;
  const execute = zone => { const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env: { ...process.env, TZ: zone }, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
  const madrid = execute('Europe/Madrid');
  assert.equal(madrid.old[0], madrid.old[1]);
  assert.deepEqual(madrid.current, execute('America/Los_Angeles').current);
  assert.deepEqual(madrid.current, execute('Asia/Tokyo').current);
  assert.notEqual(madrid.current[0].question.q, madrid.current[1].question.q);
  assert.equal(madrid.current[1].date, '2026-10-25');
});

test('la sesión fija la pregunta y mide diez segundos reales; puntuaciones y rachas se conservan', () => {
  const start = Date.parse('2026-10-28T10:00:00Z');
  const session = trivia.createDailyTriviaSession(questions, start);
  assert.equal(trivia.getTriviaSecondsLeft(session, start), 10);
  assert.equal(trivia.getTriviaSecondsLeft(session, start + 3500), 7);
  assert.equal(trivia.getTriviaSecondsLeft(session, start + 10000), 0);
  assert.equal(trivia.getTriviaSecondsLeft(session, start + 60000), 0);
  const base = { triviaLastPlayed: '2026-10-27', triviaStreak: 2, triviaPoints: 100 };
  const scored = trivia.scoreDailyTrivia(base, session, { index: session.question.correct, secondsLeft: 8 });
  assert.equal(scored.fields.triviaStreak, 3); assert.equal(scored.result.speed, 2); assert.equal(scored.result.streak, 5);
  assert.equal(scored.fields.triviaPoints, 100 + scored.result.points);
  const wrong = trivia.scoreDailyTrivia(base, session, { index: -1, secondsLeft: 0 });
  assert.equal(wrong.result.status, 'timeout'); assert.equal(wrong.fields.triviaPoints, 100); assert.equal(wrong.fields.triviaStreak, 0);
  assert.equal(trivia.triviaPreviousDate('2027-01-01'), '2026-12-31');
  assert.equal(trivia.triviaPreviousDate('2028-03-01'), '2028-02-29');
});

const extract = (source, name) => {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
  let found;
  const walk = node => { if (!node || typeof node !== 'object') return; if (node.type === 'VariableDeclarator' && node.id.name === name) found = node.init; for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value); };
  walk(ast); assert.ok(found, name); return source.slice(...found.range);
};
const storeSource = await readFile('src/components/dailyTriviaStore.js', 'utf8');
const storeCode = extract(storeSource, 'saveDailyTriviaAnswer');
const makeStore = () => {
  let profile = { triviaPoints: 20, triviaStreak: 0 }, version = 0, writes = 0;
  const context = { getSchoolDate: () => '2026-10-28', scoreDailyTrivia: trivia.scoreDailyTrivia, doc: () => ({}),
    runTransaction: async (_db, callback) => {
      for (let retry = 0; retry < 5; retry++) {
        const readVersion = version, current = structuredClone(profile); let pending;
        const result = await callback({ get: async () => ({ exists: () => true, data: () => current }), update: (_ref, fields) => { pending = fields; } });
        if (readVersion !== version) continue;
        profile = { ...profile, ...pending }; writes++; version++; return result;
      }
      throw new Error('Conflicto');
    } };
  const save = vm.runInNewContext(`(${storeCode})`, context);
  return { save: payload => save({ db: {}, appId: 'app', studentId: 's1', ...payload }), profile: () => profile, writes: () => writes };
};

test('dos pestañas no suman puntos dos veces y un intento de ayer no se registra como hoy', async () => {
  const store = makeStore(), session = trivia.createDailyTriviaSession(questions, Date.parse('2026-10-28T10:00:00Z'));
  const payload = { session, selection: { index: session.question.correct, secondsLeft: 9 } };
  const results = await Promise.allSettled([store.save(payload), store.save(payload)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(store.writes(), 1);
  await assert.rejects(store.save({ ...payload, session: { ...session, date: '2026-10-27' } }), /terminado/);
  assert.equal(store.profile().triviaLastPlayed, '2026-10-28');
});

test('el reloj real programa medianoche de Madrid y se actualiza al recuperar foco', async () => {
  const source = await readFile('src/components/useDailyTriviaDate.js', 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', range: true });
  const fn = ast.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
  for (const date of ['2026-03-29', '2026-10-25', '2026-12-31']) {
    let now = Date.parse(`${date}T12:00:00Z`), current, timer, cleanup; const events = {};
    const context = { Date: { now: () => now }, getSchoolDate: value => getSchoolDate(value ?? now), vacationDeadlineMillis,
      useState: init => { current = init(); return [current, value => { current = value; }]; }, useEffect: effect => { cleanup = effect(); },
      setTimeout: (callback, delay) => { timer = { callback, delay }; return 1; }, clearTimeout() {},
      window: { addEventListener: (name, fn) => { events[name] = fn; }, removeEventListener() {} },
      document: { hidden: false, addEventListener: (name, fn) => { events[name] = fn; }, removeEventListener() {} } };
    vm.runInNewContext(`(${source.slice(...fn.range)})`, context)();
    assert.equal(current, date); assert.equal(timer.delay, vacationDeadlineMillis(date) - now + 30);
    now = vacationDeadlineMillis(date) + 100; timer.callback(); assert.equal(current, dayOffset(date, 1));
    now += 86400000; events.focus(); assert.equal(current, getSchoolDate(now)); cleanup();
  }
});

const studentSource = await readFile('src/components/StudentPortal.jsx', 'utf8');
const handlerCode = extract(studentSource, 'handleTriviaAnswer'), startCode = extract(studentSource, 'startTrivia');
const makePlayer = () => {
  let now = Date.parse('2026-10-28T10:00:00Z'), saves = 0, fail = false;
  const state = {}, profile = { id: 's1' };
  const context = { profile, TRIVIA_QUESTIONS: questions, triviaModal: false, triviaResult: null, triviaSessionRef: { current: null }, triviaAnswerLock: { current: false }, triviaPendingAnswer: { current: null }, triviaCloseTimer: { current: null },
    createDailyTriviaSession: bank => trivia.createDailyTriviaSession(bank, now), getTriviaSecondsLeft: session => trivia.getTriviaSecondsLeft(session, now), getSchoolDate: () => getSchoolDate(now), clearTimeout() {}, setTimeout: () => 1,
    showToast: text => { state.toast = text; }, db: {}, appId: 'app',
    saveDailyTriviaAnswer: async ({ session, selection }) => { saves++; if (fail) { fail = false; throw new Error('Sin conexión'); } return trivia.scoreDailyTrivia(profile, session, selection).result; } };
  for (const name of ['TriviaSession', 'TriviaSelected', 'TriviaResult', 'TriviaError', 'TriviaTime', 'TriviaModal', 'TriviaSaving']) context[`set${name}`] = value => { state[name] = value; context[name[0].toLowerCase() + name.slice(1)] = value; };
  const start = vm.runInNewContext(`(${startCode})`, context), answer = vm.runInNewContext(`(${handlerCode})`, context);
  return { start, answer, state, context, saves: () => saves, advance: seconds => { now += seconds * 1000; }, fail: () => { fail = true; } };
};

test('manejadores reales fijan la pregunta, impiden dobles clics y permiten reintentar la misma respuesta sin perder su tiempo', async () => {
  const player = makePlayer(); player.start(); const session = player.context.triviaSessionRef.current;
  player.advance(1); player.fail(); await player.answer(session.question.correct);
  assert.ok(player.state.TriviaError); assert.equal(player.state.TriviaResult, null);
  player.advance(20); await player.answer((session.question.correct + 1) % session.question.options.length);
  assert.equal(player.state.TriviaResult.status, 'win'); assert.equal(player.state.TriviaResult.speed, 2);
  assert.equal(player.context.triviaPendingAnswer.current.index, session.question.correct);
  const double = makePlayer(); double.start(); const choice = double.context.triviaSessionRef.current.question.correct;
  await Promise.all([double.answer(choice), double.answer(choice)]); assert.equal(double.saves(), 1);
});

test('no se puede puntuar una sesión pasada ni ampliar los diez segundos al dejar la pestaña dormida', async () => {
  const expired = makePlayer(); expired.start(); expired.advance(12); await expired.answer(expired.context.triviaSessionRef.current.question.correct);
  assert.equal(expired.state.TriviaResult.status, 'timeout');
  const yesterday = makePlayer(); yesterday.start(); yesterday.advance(86400); await yesterday.answer(0);
  assert.equal(yesterday.saves(), 0); assert.equal(yesterday.state.TriviaModal, false); assert.match(yesterday.state.toast, /nuevo día/);
});
