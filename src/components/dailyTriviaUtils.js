import { getSchoolDate, isCalendarDate } from './vacationChallengeUtils.js';

const DAY = 86400000;
const ANCHOR = '2026-10-28';
const dayNumber = date => {
  if (!isCalendarDate(date)) throw new Error('Fecha del trivial no válida.');
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY;
};
const keyFor = question => String(question.q || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const cache = new WeakMap();
const poolFor = questions => {
  if (cache.has(questions)) return cache.get(questions);
  const seen = new Set();
  const pool = questions.filter(question => {
    const key = keyFor(question);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
  cache.set(questions, pool); return pool;
};
const gcd = (a, b) => b ? gcd(b, a % b) : a;
export const getDailyTrivia = (questions, date = getSchoolDate()) => {
  const pool = poolFor(questions);
  if (!pool.length) return { date, question: null, poolSize: 0 };
  let step = 137;
  while (gcd(step, pool.length) !== 1) step++;
  // Conserva la pregunta civil del día de transición; después no se reinicia
  // en enero ni se cuentan horas de días de 23/25 horas.
  const anchorDayOfYear = dayNumber(ANCHOR) - dayNumber('2025-12-31');
  const previousQuestion = questions[(anchorDayOfYear * 137) % questions.length];
  const anchorIndex = Math.max(0, pool.findIndex(question => keyFor(question) === keyFor(previousQuestion)));
  const raw = anchorIndex + (dayNumber(date) - dayNumber(ANCHOR)) * step;
  const index = ((raw % pool.length) + pool.length) % pool.length;
  return { date, question: pool[index], poolSize: pool.length };
};
export const createDailyTriviaSession = (questions, now = Date.now()) => ({
  ...getDailyTrivia(questions, getSchoolDate(now)), startedAt: now, deadline: now + 10000
});
export const getTriviaSecondsLeft = (session, now = Date.now()) => Math.max(0, Math.min(10, Math.ceil((session.deadline - now) / 1000)));
export const triviaPreviousDate = date => new Date((dayNumber(date) - 1) * DAY).toISOString().slice(0, 10);
export const scoreDailyTrivia = (profile, session, selection) => {
  const question = session.question;
  const correct = selection.index === question.correct;
  const base = ({ facil: 3, medio: 6, dificil: 9 })[question.difficulty || 'facil'] || 3;
  const newStreak = correct ? (profile.triviaLastPlayed === triviaPreviousDate(session.date) ? Number(profile.triviaStreak || 0) + 1 : 1) : 0;
  const speed = correct && selection.secondsLeft >= 7 ? 2 : 0;
  const streak = correct && newStreak % 3 === 0 ? 5 : 0;
  const points = correct ? base + speed + streak : 0;
  return { result: { status: correct ? 'win' : selection.index === -1 ? 'timeout' : 'lose', points, speed, streak, newStreakCount: newStreak },
    fields: { triviaLastPlayed: session.date, triviaPoints: Number(profile.triviaPoints || 0) + points, triviaStreak: newStreak } };
};
