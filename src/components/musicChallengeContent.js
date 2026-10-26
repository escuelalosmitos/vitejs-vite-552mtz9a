import { buildTempoQuestions, buildTempoQuestionsForAttempt, TEMPO_LESSONS } from './tempoChallengeContent.js';
import { getMusicGame, seededMusicRandom } from './musicChallengeCatalog.js';

const pick = (random, values) => values[Math.floor(random() * values.length)];
const integer = (random, min, max) => min + Math.floor(random() * (max - min + 1));
const shuffle = (random, values) => { const result = [...values]; for (let index = result.length - 1; index > 0; index--) { const other = integer(random, 0, index); [result[index], result[other]] = [result[other], result[index]]; } return result; };
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];
export const musicNote = (note, at, beats = 0.7, layer = 'melody') => ({ note, at, beats, layer });
export const musicClip = (notes, beats, bpm = 88) => ({ notes, beats, bpm });
const melody = (random, length, advanced = false) => {
  let position = integer(random, 0, 3);
  return Array.from({ length }, (_, index) => { if (index) position = Math.max(0, Math.min(7, position + pick(random, advanced ? [-2, -1, 1, 2] : [-2, 0, 2]))); return SCALE[position]; });
};
const melodicClip = (notes, bpm = 88) => musicClip(notes.map((note, index) => musicNote(note, index)), notes.length, bpm);
const rotateQuestion = (random, question) => {
  if (!question.options) return question;
  const tagged = shuffle(random, question.options.map((text, index) => ({ text, right: index === question.correct })));
  return { ...question, options: tagged.map(option => option.text), correct: tagged.findIndex(option => option.right) };
};
const directions = notes => notes.slice(1).map((note, index) => note > notes[index] ? '↑' : note < notes[index] ? '↓' : '=').join(' ');
const rhythmPattern = (random, length) => {
  const values = Array.from({ length }, () => random() > 0.4 ? '●' : '—');
  values[0] = '●'; values[length - 1] = '—'; return values;
};
export const rhythmClip = (pattern, bpm = 88) => musicClip([
  ...pattern.map((value, index) => value === '●' ? musicNote(7, index * 0.5, 0.22) : null).filter(Boolean),
  ...Array.from({ length: pattern.length / 2 }, (_, index) => musicNote(-24, index, 0.1, 'pulse'))
], pattern.length / 2, bpm);
const motives = random => {
  const root = pick(random, [-5, -2, 0, 2, 5]);
  return {
    A: [0, 4, 7, 0].map(note => note + root),
    B: [12, 9, 5, 7].map(note => note + root),
    C: [2, 7, 2, 5].map(note => note + root)
  };
};
export const structureClip = (structure, sections, bpm = 96) => musicClip(structure.flatMap((section, index) =>
  section === 'S' ? [] : sections[section].map((note, offset) => musicNote(note, index * 2 + offset * 0.5, 0.38))), structure.length * 2, bpm);
const layerNames = { melody: 'Melodía', bass: 'Bajo', harmony: 'Acompañamiento', percussion: 'Percusión' };
export const layeredClip = (notes, active, bpm) => {
  const events = [];
  if (active.includes('melody')) notes.forEach((note, index) => events.push(musicNote(note + 12, index, 0.65, 'melody')));
  if (active.includes('bass')) for (let index = 0; index < 8; index++) events.push(musicNote(index < 4 ? -24 : -17, index, 0.7, 'bass'));
  if (active.includes('harmony')) for (let index = 0; index < 8; index += 2) [0, 4, 7].forEach(note => events.push(musicNote(note - 12, index + 0.1, 1.4, 'harmony')));
  if (active.includes('percussion')) for (let index = 0; index < 16; index++) events.push(musicNote(index % 2 ? -5 : -29, index * 0.5, 0.09, 'percussion'));
  return { ...musicClip(events, 8, bpm), activeLayers: active };
};

export const musicLessons = gameId => {
  if (gameId === 'tempo-v1') return TEMPO_LESSONS;
  const lessons = {
    'echo-v1': [
      ['Escucha y recuerda', 'Escucha el modelo completo y después las tres opciones. Una reproduce exactamente sus notas y su ritmo. Puedes volver a escuchar todo lo que necesites.'],
      ['Escucha los detalles', 'Dos melodías pueden empezar y acabar igual y tener una nota diferente en el centro. Escucha la frase completa antes de decidir.'],
      ['Mantén la referencia', 'Tararear mentalmente el modelo puede ayudarte. El timbre y el volumen son iguales para que compares la melodía.'],
      ['Tu memoria en acción', 'No se trata de acertar deprisa. Alterna modelo y opciones, pide una pista y comprueba qué detalle cambió.']
    ],
    'rhythm-v1': [
      ['Sonidos y silencios', 'Cada casilla dura medio pulso. ● es un sonido y — un silencio. El golpe grave regular marca el pulso y no hay que copiarlo. Pulsa las casillas para construir el patrón.'],
      ['Divide el recorrido', 'Agrupa las casillas de dos en dos: cada pareja ocupa un pulso. Escucha qué sucede entre los golpes graves.'],
      ['Escucha lo que construyes', 'Usa «Escuchar mi construcción» para comparar tu patrón con el modelo. Puedes cambiar cualquier casilla antes de comprobar.'],
      ['Reconstrucción final', 'La comparación comprueba todas las posiciones, incluidos los silencios. Las casillas siguen avanzando aunque no suene ninguna nota.']
    ],
    'contour-v1': [
      ['Dibuja con el oído', '↑ significa que la siguiente nota es más aguda; ↓, más grave; =, la misma altura. Cada símbolo describe un paso entre dos notas.'],
      ['Un paso cada vez', 'Una melodía de cuatro notas tiene tres pasos. Sigue el movimiento sin intentar adivinar los nombres de las notas.'],
      ['Pequeños movimientos', 'Las notas próximas también pueden subir o bajar. La intensidad y la velocidad se mantienen para que puedas concentrarte en su altura.'],
      ['Encuentra el camino', 'Escucha de nuevo y recorre cada flecha mentalmente. La pista te recuerda el primer paso, pero el recorrido completo sigue siendo tuyo.']
    ],
    'form-v1': [
      ['Pon nombres a las secciones', 'Primero escucha las secciones A, B y C por separado. Después escucha la pieza y coloca una letra por cada sección que suena.'],
      ['Encuentra las repeticiones', 'Si vuelve exactamente la misma sección, vuelve su letra. Las letras identifican fragmentos, no notas musicales ni acordes.'],
      ['Construye el mapa', 'Completa las casillas en orden. Puedes escuchar tu mapa para compararlo con la pieza original.'],
      ['El recorrido completo', 'Una pieza puede volver al principio después de un contraste. Atiende a las melodías que regresan, no solo a que cambie el sonido.']
    ],
    'layers-v1': [
      ['Cuatro capas', 'La melodía es la frase aguda; el bajo, las notas graves; el acompañamiento, los acordes sostenidos; la percusión, los golpes breves. Son sonidos sintetizados para distinguir funciones.'],
      ['Escucha por separado', 'Compara cada capa con la mezcla. Las funciones se mantienen aunque cambie la melodía del ejercicio.'],
      ['Algo ha desaparecido', 'Compara la mezcla A con la B y descubre qué capa se retiró. No ha cambiado el tempo.'],
      ['Reconstruye con el oído', 'Escucha primero los graves, después los acordes, la frase aguda y los golpes. Los cuatro pueden convivir en el mismo fragmento.']
    ],
    'composer-v1': [
      ['Tu primera pieza', 'Elige un bloque en cada casilla: A, B y C contienen pequeñas melodías; S ocupa el mismo tiempo en silencio. Escucha los bloques y crea una pieza que cumpla el encargo.'],
      ['Repetición y contraste', 'Repetir un bloque da continuidad; utilizar otro aporta contraste. Hay muchas composiciones válidas: comprobamos los objetivos del encargo, no tu gusto musical.'],
      ['Haz sitio al silencio', 'Un bloque S es una sección de silencio. Puedes usarlo como una pausa entre ideas. El tiempo continúa aunque no suenen notas.'],
      ['Una misión completa', 'Combina repetición, contraste y pausas. Escucha la pieza completa antes de comprobarla. Puedes modificarla y escucharla de nuevo.']
    ]
  };
  return (lessons[gameId] || []).map(([title, text], index) => ({ title: `${index + 1} · ${title}`, paragraphs: [text], demo: [], demoLabels: [] }));
};

export const generateMusicQuestions = ({ challengeId, seed, difficulty = 'beginner', generatorVersion = 1 }) => {
  if (generatorVersion !== 1) throw new Error('Esta versión del reto no está disponible.');
  const game = getMusicGame(challengeId);
  if (!game) throw new Error('Reto no reconocido.');
  const advanced = difficulty === 'advanced';
  const random = seededMusicRandom(`${seed}|${challengeId}`);
  if (challengeId === 'tempo-v1') return buildTempoQuestions(difficulty, String(seed), 2).map((question, index) => ({
    ...question, contentVersion: 3, melodyId: `${seed}-${index}`,
    clips: (() => { const notes = melody(random, 8, true); const rhythm = pick(random, [[1], [1, 0.5, 0.5, 1], [0.5, 1, 0.5, 2]]); return question.clips.map(clip => ({ ...clip, melody: notes, rhythm })); })()
  }));
  return Array.from({ length: game.total }, (_, index) => {
    const chapter = Math.floor(index / (game.total / 4));
    const bpm = integer(random, 80, 100);
    const base = { id: `${challengeId}-${index}`, chapter, difficulty, contentVersion: 3 };
    if (challengeId === 'echo-v1') {
      const notes = melody(random, advanced ? 8 : 5, advanced);
      const variants = [notes];
      while (variants.length < 3) {
        const modified = [...notes]; const at = integer(random, 1, notes.length - 2);
        modified[at] += pick(random, advanced ? [-2, 2] : [-5, 5]);
        if (!variants.some(variant => variant.join() === modified.join())) variants.push(modified);
      }
      const choices = shuffle(random, variants);
      const correct = choices.findIndex(variant => variant === notes);
      return { ...base, prompt: '¿Qué opción reproduce exactamente el modelo?', options: ['Opción 1', 'Opción 2', 'Opción 3'], correct,
        clips: [notes, ...choices].map(value => melodicClip(value, bpm)), clipLabels: ['Modelo', 'Opción 1', 'Opción 2', 'Opción 3'],
        hint: 'Escucha el centro de la frase: las alternativas tienen al menos una nota distinta.', explanation: `La opción ${correct + 1} conserva todas las notas del modelo. Las otras cambian una nota interior; la velocidad y el ritmo son iguales.` };
    }
    if (challengeId === 'rhythm-v1') {
      const solution = rhythmPattern(random, advanced ? 12 : 8);
      return { ...base, kind: 'builder', builder: 'rhythm', length: solution.length, palette: ['●', '—'], solution,
        prompt: 'Reconstruye el ritmo: coloca sonidos y silencios en las casillas.', clips: [rhythmClip(solution, bpm)], bpm,
        hint: `El patrón empieza con sonido. Agrupa las casillas por parejas; cada pareja ocupa un pulso.`,
        explanation: `El patrón del modelo es ${solution.join(' ')}. Los golpes graves solo marcan la referencia.`, options: ['Patrón construido'], correct: 0 };
    }
    if (challengeId === 'contour-v1') {
      const length = advanced ? 6 : 4;
      const notes = [pick(random, [0, 4, 7])];
      for (let at = 1; at < length; at++) notes.push(notes.at(-1) + pick(random, advanced ? [-2, 0, 2] : [-5, 0, 5]));
      const path = directions(notes);
      const choices = [path];
      while (choices.length < 4) { const other = Array.from({ length: length - 1 }, () => pick(random, ['↑', '↓', '='])).join(' '); if (!choices.includes(other)) choices.push(other); }
      return rotateQuestion(random, { ...base, prompt: '¿Qué camino sigue la melodía?', options: choices, correct: 0, clips: [melodicClip(notes, bpm)],
        hint: `El primer paso es ${path.split(' ')[0]}. Sigue comparando cada nota con la anterior.`, explanation: `El recorrido es ${path}. Cada símbolo compara dos notas consecutivas; no indica su duración.` });
    }
    if (challengeId === 'form-v1') {
      const sections = motives(random); const length = advanced ? 6 : 4;
      const solution = Array.from({ length }, () => pick(random, ['A', 'B', 'C'])); solution[0] = 'A'; solution[length - 1] = 'A'; solution[1] = 'B';
      return { ...base, kind: 'builder', builder: 'form', length, palette: ['A', 'B', 'C'], solution, sections, bpm,
        prompt: 'Escucha las secciones y reconstruye el mapa de la pieza.',
        clips: [...['A', 'B', 'C'].map(letter => structureClip([letter], sections, bpm)), structureClip(solution, sections, bpm)], clipLabels: ['Sección A', 'Sección B', 'Sección C', 'Pieza completa'],
        hint: 'La pieza empieza por A. Una sección repetida conserva su letra.', explanation: `El mapa de esta pieza es ${solution.join(' – ')}. Cada letra identifica una sección completa.`, options: ['Mapa construido'], correct: 0 };
    }
    if (challengeId === 'layers-v1') {
      const names = Object.keys(layerNames); const target = pick(random, names); const notes = melody(random, 8, advanced);
      const solo = chapter < 2;
      const layers = solo ? [target] : names.filter(name => name !== target);
      return rotateQuestion(random, { ...base, prompt: solo ? '¿Qué función musical escuchas en el fragmento?' : '¿Qué capa desaparece en la mezcla B?', options: Object.values(layerNames), correct: names.indexOf(target),
        clips: solo ? [layeredClip(notes, layers, bpm)] : [layeredClip(notes, names, bpm), layeredClip(notes, layers, bpm)],
        hint: 'Busca la frase aguda, las notas graves, los acordes sostenidos o los golpes breves.',
        explanation: solo ? `Escuchas ${layerNames[target].toLowerCase()}: ${target === 'melody' ? 'la frase aguda' : target === 'bass' ? 'el soporte de notas graves' : target === 'harmony' ? 'los acordes sostenidos' : 'los golpes breves regulares'}.` : `En B falta ${layerNames[target].toLowerCase()}. Las demás capas conservan sus notas y su tempo.` });
    }
    const sections = motives(random); const length = advanced ? 6 : 4;
    const rules = { start: pick(random, ['A', 'B']), contrast: true, minKinds: advanced ? 3 : 2, repeat: true, silence: chapter >= 2, end: chapter === 3 ? 'A' : null };
    const objectives = [`Empieza por ${rules.start}`, advanced ? 'Usa los tres bloques musicales A, B y C' : 'Usa al menos dos bloques musicales distintos', 'Repite algún bloque musical', ...(rules.silence ? ['Incluye al menos un silencio S'] : []), ...(rules.end ? ['Termina con A'] : [])];
    return { ...base, kind: 'builder', builder: 'composer', length, palette: ['A', 'B', 'C', 'S'], rules, sections, bpm, objectives,
      prompt: 'Compón una pieza que cumpla estos objetivos.', clips: ['A', 'B', 'C'].map(letter => structureClip([letter], sections, bpm)), clipLabels: ['Bloque A', 'Bloque B', 'Bloque C'],
      hint: `Reserva primero ${rules.start} para el inicio${rules.end ? ' y A para el final' : ''}. Después coloca una repetición, un contraste${rules.silence ? ' y un silencio' : ''}.`,
      explanation: 'Hay muchas soluciones válidas. Los objetivos comprueban la estructura de tu pieza; no valoran si una composición es más bonita que otra.', options: ['Composición creada'], correct: 0 };
  });
};

export const musicBuilderChecks = (question, submission) => {
  const values = Array.isArray(submission) ? submission : [];
  const complete = values.length === question.length && values.every(value => question.palette.includes(value));
  if (question.builder !== 'composer') return [{ label: 'Coincide con el modelo, incluidos todos los sonidos y silencios', ok: complete && values.every((value, index) => value === question.solution[index]) }];
  const musical = values.filter(value => value !== 'S');
  return [
    { label: `Empieza por ${question.rules.start}`, ok: complete && values[0] === question.rules.start },
    { label: question.rules.minKinds === 3 ? 'Incluye A, B y C' : 'Incluye contraste entre bloques musicales', ok: complete && new Set(musical).size >= (question.rules.minKinds || 2) },
    { label: 'Repite algún bloque musical', ok: complete && new Set(musical).size < musical.length },
    ...(question.rules.silence ? [{ label: 'Incluye un silencio S', ok: complete && values.includes('S') }] : []),
    ...(question.rules.end ? [{ label: `Termina con ${question.rules.end}`, ok: complete && values.at(-1) === question.rules.end }] : [])
  ];
};
export const musicSubmissionClip = (question, values) => question.builder === 'rhythm' ? rhythmClip(values, question.bpm) : structureClip(values, question.sections, question.bpm);
export const buildMusicQuestionsForAttempt = attempt => {
  if (attempt.contentVersion !== 3) return buildTempoQuestionsForAttempt(attempt);
  const variants = new Map();
  const get = difficulty => { if (!variants.has(difficulty)) variants.set(difficulty, generateMusicQuestions({ ...attempt, difficulty })); return variants.get(difficulty); };
  return get(attempt.difficulty).map((question, index) => get(attempt.answers?.[index]?.difficulty || attempt.difficulty)[index] || question);
};
