import { isCalendarDate, getSchoolDate } from './vacationChallengeUtils.js';

// Identificadores estables: nunca reutilizar uno para otro juego ni borrar versiones.
export const MUSIC_GAMES = [
  { id: 'tempo-v1', title: 'Detective del tempo', total: 36, description: 'Distingue velocidad, pulso, intensidad y altura.' },
  { id: 'echo-v1', title: 'El eco perdido', total: 32, description: 'Escucha, recuerda y reconoce una melodía entre alternativas.' },
  { id: 'rhythm-v1', title: 'Laboratorio de ritmos', total: 24, description: 'Construye patrones con sonidos y silencios.' },
  { id: 'contour-v1', title: 'El laberinto melódico', total: 32, description: 'Sigue melodías que suben, bajan o repiten notas.' },
  { id: 'form-v1', title: 'El mapa de la canción', total: 24, description: 'Descubre las secciones que se repiten y reconstruye su orden.' },
  { id: 'layers-v1', title: 'El mezclador secreto', total: 32, description: 'Separa con el oído melodía, bajo, acompañamiento y percusión.' },
  { id: 'composer-v1', title: 'Misión compositor', total: 16, description: 'Crea pequeñas piezas con repetición, contraste, silencios y finales.' }
];
export const DEFAULT_MUSIC_ORDER = MUSIC_GAMES.map(game => game.id);
export const MUSIC_GENERATOR_VERSION = 1;
export const getMusicGame = id => MUSIC_GAMES.find(game => game.id === id);
export const normalizeMusicOrder = value => Array.isArray(value) && value.length === MUSIC_GAMES.length
  && new Set(value).size === MUSIC_GAMES.length && value.every(id => getMusicGame(id)) ? [...value] : [...DEFAULT_MUSIC_ORDER];
export const nextMusicAssignment = (progress, order) => {
  const ids = normalizeMusicOrder(order);
  const last = ids.indexOf(progress?.lastChallengeId);
  return { challengeId: ids[(last + 1) % ids.length], sequenceOrdinal: Number(progress?.nextOrdinal || 0) };
};
export const musicSeed = text => {
  let value = 2166136261;
  for (const character of String(text)) { value ^= character.charCodeAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
};
export const seededMusicRandom = seed => {
  let state = musicSeed(seed);
  return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
};
export const musicVacationCounts = (dates, year = getSchoolDate().slice(0, 4)) => {
  const counts = Array(7).fill(0);
  [...new Set(dates || [])].filter(date => isCalendarDate(date) && date.startsWith(`${year}-`))
    .forEach(date => counts[new Date(`${date}T12:00:00Z`).getUTCDay()]++);
  return counts;
};
