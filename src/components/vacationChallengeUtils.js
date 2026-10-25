export const VACATION_CHALLENGE_ID = 'tempo-v1';
export const VACATION_CHALLENGE_TOTAL = 36;
export const readChallengeClock = () => Date.now();
const schoolFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

export const getSchoolParts = (instant = Date.now()) => Object.fromEntries(
  schoolFormatter.formatToParts(new Date(instant)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)])
);
export const getSchoolDate = (instant = Date.now()) => {
  const { year, month, day } = getSchoolParts(instant);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
export const isCalendarDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export const schoolDateTimeMillis = (dateStr, time = '00:00') => {
  if (!isCalendarDate(dateStr)) return NaN;
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour || 0, minute || 0);
  let instant = target;
  for (let iteration = 0; iteration < 3; iteration++) {
    const part = getSchoolParts(instant);
    instant += target - Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second);
  }
  return instant;
};
export const vacationDeadlineMillis = dateStr => {
  if (!isCalendarDate(dateStr)) return NaN;
  const next = new Date(`${dateStr}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return schoolDateTimeMillis(next.toISOString().slice(0, 10));
};
export const isVacationChallengeOpen = (dateStr, vacationDates, now = Date.now()) => (
  isCalendarDate(dateStr) && vacationDates.includes(dateStr) && now < vacationDeadlineMillis(dateStr)
);
export const buildVacationAttemptId = (studentId, dateStr) => {
  if (!/^[A-Za-z0-9_-]+$/.test(String(studentId)) || !isCalendarDate(dateStr)) throw new Error('Alumno o fecha de vacaciones no válidos.');
  return `${studentId}_${dateStr}`;
};
export const timestampMillis = value => value?.toMillis ? value.toMillis() : value?.seconds !== undefined
  ? value.seconds * 1000 : (Date.parse(value || '') || 0);
export const isUnreadVacationAttempt = (attempt, adminUid) => (
  attempt.status === 'completed' && timestampMillis(attempt.completedAt) > 0 && !attempt.adminSeenBy?.[adminUid]
);
export const validVacationAnswers = (answers = []) => (Array.isArray(answers) ? answers : []).filter(answer => (
  answer && typeof answer === 'object' && typeof answer.questionId === 'string'
  && Number.isInteger(answer.firstOption) && Number.isInteger(answer.lastOption)
  && typeof answer.firstCorrect === 'boolean' && typeof answer.correct === 'boolean'
));
export const summarizeVacationAnswers = (answers = []) => {
  const valid = validVacationAnswers(answers);
  return {
    answered: valid.length,
    firstCorrect: valid.filter(answer => answer.firstCorrect === true).length,
    finalCorrect: valid.filter(answer => answer.correct === true).length,
    withHelp: valid.filter(answer => answer.hintUsed || answer.tries > 1).length
  };
};

// Sólo información docente del intento: no otorga puntos del Trivial ni tickets.
export const createVacationAttempt = ({ student, dateStr, classData, difficulty }) => {
  if (!['beginner', 'advanced'].includes(difficulty)) throw new Error('Elige una dificultad.');
  const pathParts = String(classData.refPath || '').split('/');
  if (pathParts.length !== 6 || pathParts[2] !== 'users' || pathParts[4] !== 'recurringClasses') throw new Error('No se ha podido vincular el reto a tu clase.');
  return {
    studentId: student.id, studentEmail: String(student.email || '').trim().toLowerCase(),
    studentName: String(student.useAlias && student.alias ? student.alias : student.name || ''),
    vacationDate: dateStr, challengeId: VACATION_CHALLENGE_ID, challengeTitle: 'Detective del tempo',
    difficulty, classId: classData.id || pathParts[5], classOwnerUid: pathParts[3], classDocumentId: pathParts[5],
    subject: classData.subject || '', status: 'in_progress', cursor: 0, answers: [],
    revision: 0, elapsedSeconds: 0
  };
};

export const recordVacationAnswer = (previous, question, option, { hintUsed = false, listenCount = 0 } = {}) => {
  const correct = option === question.correct;
  return {
    questionId: question.id, firstOption: previous?.firstOption ?? option, lastOption: option,
    tries: (previous?.tries || 0) + 1, firstCorrect: previous?.firstCorrect ?? correct,
    correct, hintUsed: Boolean(previous?.hintUsed || hintUsed),
    listenCount: Math.max(previous?.listenCount || 0, listenCount)
  };
};
