const SOUND_BASE = { bpm: 84, gain: 0.24, semitones: 0, density: 1, beats: 8 };
const sound = changes => ({ ...SOUND_BASE, ...changes });
const question = (id, chapter, prompt, options, correct, explanation, hint, clips) => ({ id, chapter, prompt, options, correct, explanation, hint, clips });

export const TEMPO_LESSONS = [
  {
    title: '1 · Encuentra el pulso',
    paragraphs: [
      'El pulso es la referencia regular con la que podemos acompañar mucha música: como los pasos de un paseo. El ritmo de la melodía puede cambiar mientras esa referencia sigue estable.',
      'El tempo indica a qué velocidad avanza ese pulso. Si pasan más pulsos en un minuto, el tempo es mayor. BPM significa pulsos por minuto: 60 BPM equivale a un pulso por segundo.',
      'Escucha los ejemplos completos. Puedes acompañar con un dedo, pero no tienes que grabarte ni demostrarlo al profesor. En los audios oirás un golpe grave que sirve de referencia.'
    ],
    demo: [sound({ bpm: 60 }), sound({ bpm: 108 })], demoLabels: ['Escuchar 60 BPM', 'Escuchar 108 BPM']
  },
  {
    title: '2 · Rápido, fuerte y agudo son cosas distintas',
    paragraphs: [
      'Más rápido significa que los pulsos están más cerca en el tiempo. Más fuerte significa mayor intensidad. Más agudo significa una altura sonora mayor: por ejemplo, al subir una melodía hacia notas más altas.',
      'Una melodía puede sonar más fuerte sin ir más rápida. También puede subir de altura sin cambiar su tempo. En este bloque comparamos esas propiedades de una en una.',
      'Mantén un volumen cómodo y parecido durante toda la actividad. Si dudas, repite las dos versiones y atiende al golpe grave antes de responder.'
    ],
    demo: [sound({ gain: 0.12 }), sound({ gain: 0.28 })], demoLabels: ['Versión suave', 'Versión más intensa']
  },
  {
    title: '3 · Sigue lo que cambia',
    paragraphs: [
      'El tempo también puede cambiar dentro de un fragmento: acelerando significa cada vez más rápido y ritardando, cada vez más lento.',
      'No confundas más notas con más tempo. Una melodía puede tocar dos notas por pulso mientras el acompañamiento sigue marcando los mismos pulsos.',
      'Para comprobarlo, sigue el golpe grave regular. Observa si sus separaciones cambian o si cambia solamente lo que ocurre entre un golpe y el siguiente.'
    ],
    demo: [sound({ density: 1 }), sound({ density: 2 })], demoLabels: ['Una nota por pulso', 'Dos notas por pulso']
  },
  {
    title: '4 · Tu investigación final',
    paragraphs: [
      'Ahora mezclaremos los conceptos con ejemplos nuevos. Compara el tempo, la intensidad, la altura y la cantidad de notas.',
      'Primero escucha, después elige. Si necesitas una pista puedes pedirla: la actividad es para aprender. Tu resumen distinguirá los aciertos iniciales de las respuestas corregidas después de recibir ayuda.',
      'No hay límite de segundos por pregunta. El acceso completo termina a las 23:59 del día de vacaciones indicado en tu tarjeta.'
    ],
    demo: [sound({ bpm: 72, gain: 0.14 }), sound({ bpm: 96, gain: 0.25 })], demoLabels: ['Ejemplo A', 'Ejemplo B']
  }
];

// Se conserva el contenido inicial para interpretar respuestas ya guardadas.
const buildLegacyTempoQuestions = (difficulty = 'beginner', seed = '') => {
  const advanced = difficulty === 'advanced';
  const shift = [...seed].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4;
  const delta = advanced ? 10 : 30;
  const result = [];
  const tempoPair = (index, chapter) => {
    const base = 66 + ((index + shift) % 4) * 8 + (chapter === 3 ? 5 : 0);
    const bFaster = index % 2 === 0;
    result.push(question(`tempo-${index}`, chapter, '¿Qué versión tiene un tempo más rápido?', ['La versión A', 'La versión B'], bFaster ? 1 : 0,
      `La versión ${bFaster ? 'B' : 'A'} tiene los pulsos más próximos: ${base + delta} BPM frente a ${base} BPM. No estamos comparando el volumen ni la altura.`,
      'Escucha el golpe grave: ¿en qué versión se repite con menos tiempo entre golpes?',
      [sound({ bpm: base + (bFaster ? 0 : delta) }), sound({ bpm: base + (bFaster ? delta : 0) })]));
  };
  for (let index = 0; index < 6; index++) tempoPair(index, 0);
  for (let index = 0; index < 2; index++) {
    const bpm = index ? 120 : 60;
    result.push(question(`bpm-${index}`, 0, `¿Qué significa un tempo de ${bpm} BPM?`,
      [`${bpm} pulsos por minuto`, `${bpm} notas distintas`, `${bpm} segundos por pulso`], 0,
      `BPM cuenta pulsos por minuto. A ${bpm} BPM pasan ${index ? 'dos pulsos por segundo' : 'un pulso por segundo'}. Una pieza puede tener varias notas dentro de cada pulso.`,
      'Las letras BPM describen una cantidad de pulsos dentro de un minuto.', [sound({ bpm })]));
  }
  for (let index = 0; index < 2; index++) {
    const beats = index ? 6 : 4;
    result.push(question(`count-${index}`, 0, '¿Cuántos golpes graves de referencia escuchas?', ['Cuatro', 'Seis', 'Ocho'], index,
      `Escuchaste ${beats} golpes graves. Contar estos golpes nos ayuda a seguir el pulso sin contar cada nota de la melodía.`,
      'Cuenta sólo los golpes graves regulares, uno a uno.', [sound({ bpm: 72, beats })]));
  }
  const propertyPair = (index, chapter) => {
    const kind = index % 2 ? 'pitch' : 'gain';
    const increasing = index % 4 < 2;
    const highGain = advanced ? 0.25 : 0.30;
    const lowGain = advanced ? 0.15 : 0.10;
    const interval = (advanced ? 4 : 9) + (chapter === 3 ? 1 : 0);
    const bpm = chapter === 3 ? 91 : 84;
    const changeA = kind === 'gain' ? { gain: increasing ? lowGain : highGain } : { semitones: increasing ? 0 : interval };
    const changeB = kind === 'gain' ? { gain: increasing ? highGain : lowGain } : { semitones: increasing ? interval : 0 };
    const label = kind === 'gain' ? 'Más fuerte' : 'Más aguda';
    const opposite = kind === 'gain' ? 'Más suave' : 'Más grave';
    result.push(question(`property-${index}`, chapter, '¿Cómo cambia la versión B respecto a la A?',
      [label, opposite, 'Más rápida', 'Más lenta'], increasing ? 0 : 1,
      `B suena ${increasing ? label.toLowerCase() : opposite.toLowerCase()}, pero los dos fragmentos mantienen ${bpm} BPM. ${kind === 'gain' ? 'Ha cambiado la intensidad, no la velocidad.' : 'Ha cambiado la altura de la melodía, no la velocidad.'}`,
      kind === 'gain' ? 'Compara cuánto destaca el sonido, manteniendo el volumen del dispositivo.' : 'Compara si la melodía está más arriba o más abajo, sin fijarte en el volumen.',
      [sound({ ...changeA, bpm }), sound({ ...changeB, bpm })]));
  };
  for (let index = 0; index < 8; index++) propertyPair(index, 1);
  for (let index = 0; index < 4; index++) {
    const faster = index % 2 === 0;
    result.push(question(`change-${index}`, 2, '¿Qué sucede con el tempo dentro de este fragmento?', ['Se acelera', 'Se hace más lento', 'Permanece constante'], faster ? 0 : 1,
      `La separación entre los golpes ${faster ? 'disminuye: el tempo acelera' : 'aumenta: el tempo se hace más lento'}. La referencia para escucharlo es el pulso grave.`,
      'Compara las separaciones entre golpes al principio y al final.',
      [sound({ bpm: faster ? 64 : 112, endBpm: faster ? 112 : 64, beats: advanced ? 10 : 8 })]));
  }
  for (let index = 0; index < 4; index++) {
    const bpm = 72 + index * 6;
    result.push(question(`density-${index}`, 2, 'En B hay más notas. ¿Qué ocurre con el pulso grave?', ['Se mantiene igual', 'Va el doble de rápido', 'Desaparece'], 0,
      `Las dos versiones mantienen ${bpm} BPM. B tiene más notas entre los pulsos, pero el pulso grave no cambia de velocidad.`,
      'Atiende sólo al golpe grave del fondo y no a todas las notas que hay entre sus golpes.',
      [sound({ bpm }), sound({ bpm, density: 2 })]));
  }
  for (let index = 6; index < 10; index++) tempoPair(index, 3);
  for (let index = 8; index < 12; index++) propertyPair(index, 3);
  result.push(question('final-constant', 3, '¿Qué sucede con el tempo de este fragmento?', ['Se acelera', 'Se hace más lento', 'Permanece constante'], 2,
    'El tempo se mantiene en 90 BPM: los golpes graves conservan la misma separación, aunque la melodía tenga notas diferentes.', 'Compara la regularidad de los golpes graves.', [sound({ bpm: 90, beats: 10 })]));
  result.push(question('final-concept', 3, 'Una melodía sube hacia notas más agudas, pero el pulso no cambia. ¿Ha aumentado necesariamente el tempo?', ['Sí, agudo significa rápido', 'No: altura y tempo son propiedades diferentes', 'Sí, si también suena más fuerte'], 1,
    'La altura, la intensidad y el tempo son propiedades diferentes. Podemos cambiar una sin cambiar las otras.', 'Recuerda los ejemplos en los que cambiaba sólo una propiedad.', [sound({ semitones: 0 }), sound({ semitones: 9 })]));
  return result;
};

export const TEMPO_CONTENT_VERSION = 2;

// Motivos originales: una identidad melódica para cada una de las 36 actividades.
// A y B comparten el motivo y su ritmo; sólo cambia la propiedad preguntada.
export const TEMPO_MELODIES = [
  [0, 2, 4, 7, 5, 4, 2, 0], [0, 4, 2, 5, 7, 4, 2, 0],
  [7, 5, 4, 2, 0, 2, 4, 0], [0, 7, 4, 5, 2, 4, 2, 0],
  [4, 2, 0, 5, 4, 7, 2, 0], [2, 5, 4, 7, 9, 7, 4, 2],
  [0, 2, 5, 4, 7, 5, 2, 0], [7, 9, 7, 4, 5, 2, 4, 0],
  [0, 4, 7, 5, 4, 2, 7, 0], [5, 4, 2, 0, 2, 5, 4, 0],
  [0, 5, 2, 7, 4, 5, 2, 0], [4, 7, 9, 7, 5, 4, 2, 0],
  [9, 7, 4, 5, 2, 4, 7, 0], [2, 4, 0, 7, 5, 4, 2, 0],
  [0, 7, 9, 5, 7, 4, 2, 0], [5, 9, 7, 4, 2, 5, 4, 0],
  [7, 4, 0, 2, 5, 4, 2, 0], [0, 2, 7, 9, 5, 7, 4, 0],
  [4, 5, 7, 2, 4, 0, 2, 0], [9, 5, 7, 4, 2, 0, 4, 0],
  [0, 4, 5, 9, 7, 5, 2, 0], [2, 7, 5, 4, 9, 7, 4, 2],
  [7, 2, 4, 0, 5, 4, 2, 0], [5, 7, 4, 9, 7, 2, 4, 0],
  [0, 5, 9, 7, 4, 5, 2, 0], [4, 9, 7, 5, 2, 4, 7, 0],
  [9, 4, 5, 2, 7, 4, 2, 0], [2, 0, 4, 5, 9, 7, 4, 2],
  [0, 9, 7, 4, 5, 2, 4, 0], [7, 0, 2, 5, 4, 7, 2, 0],
  [4, 0, 5, 7, 9, 5, 2, 0], [5, 2, 7, 9, 4, 5, 2, 0],
  [2, 9, 5, 7, 4, 2, 0, 2], [9, 2, 4, 7, 5, 4, 2, 0],
  [7, 5, 0, 4, 2, 5, 4, 0], [0, 12, 9, 7, 5, 4, 2, 0]
];
const RHYTHMS = [
  [1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 0.5, 0.5, 1, 1, 1, 2],
  [0.5, 0.5, 1, 1, 1.5, 0.5, 1, 2], [1.5, 0.5, 1, 1, 0.5, 0.5, 1, 2],
  [1, 0.5, 0.5, 2, 1, 0.5, 0.5, 2], [0.5, 1, 0.5, 1, 2, 1, 1, 1],
  [1, 1, 1, 0.5, 0.5, 1, 1.5, 1.5]
];

export const buildTempoQuestions = (difficulty = 'beginner', seed = '', contentVersion = TEMPO_CONTENT_VERSION) => {
  const legacy = buildLegacyTempoQuestions(difficulty, seed);
  if (contentVersion === 1) return legacy.map(item => ({ ...item, difficulty, contentVersion: 1 }));
  const advanced = difficulty === 'advanced';
  const shift = [...seed].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return legacy.map((original, index) => {
    const item = { ...original, difficulty, contentVersion: TEMPO_CONTENT_VERSION, melodyId: `melody-${index + 1}` };
    item.clips = original.clips.map(clip => ({ ...clip, melody: TEMPO_MELODIES[index], rhythm: RHYTHMS[index % RHYTHMS.length] }));
    if (item.id.startsWith('tempo-')) {
      const base = Math.min(...item.clips.map(clip => clip.bpm));
      const ratio = advanced ? (item.chapter === 3 ? 0.04 : 0.08) + (index % 3) * 0.01 : 0.25 + (index % 3) * 0.05;
      const delta = Math.max(3, Math.round(base * ratio));
      item.clips = item.clips.map((clip, i) => ({ ...clip, bpm: i === original.correct ? base + delta : base }));
      item.explanation = `La versión ${original.correct === 1 ? 'B' : 'A'} tiene los pulsos más próximos: ${base + delta} BPM frente a ${base} BPM. La melodía, el ritmo, la intensidad y la altura son iguales en ambas versiones.`;
    }
    if (item.id.startsWith('change-')) {
      const faster = original.correct === 0;
      const base = 76 + (index % 4) * 4;
      const delta = advanced ? Math.round(base * 0.15) : Math.round(base * 0.5);
      item.clips = item.clips.map(clip => ({ ...clip, bpm: faster ? base : base + delta, endBpm: faster ? base + delta : base }));
    }
    if (item.id.startsWith('count-') && advanced) {
      const beats = item.id === 'count-0' ? 7 : 9;
      item.options = ['Cinco', 'Siete', 'Nueve']; item.correct = beats === 7 ? 1 : 2;
      item.clips = item.clips.map(clip => ({ ...clip, beats }));
      item.explanation = `Escuchaste ${beats} golpes graves. Cuenta la referencia grave y no cada nota de la melodía.`;
    }
    const rotation = (shift + index) % item.options.length;
    item.options = [...item.options.slice(rotation), ...item.options.slice(0, rotation)];
    item.correct = (item.correct - rotation + item.options.length) % item.options.length;
    return item;
  });
};

// Una respuesta antigua conserva su pregunta y nivel originales. Sólo las
// actividades pendientes usan el contenido nuevo y la dificultad seleccionada.
export const upgradeTempoAttempt = attempt => !attempt || attempt.status === 'completed' ? attempt : ({
  ...attempt, contentVersion: TEMPO_CONTENT_VERSION,
  answers: (attempt.answers || []).map(answer => ({ ...answer,
    difficulty: answer.difficulty || attempt.difficulty,
    contentVersion: answer.contentVersion || attempt.contentVersion || 1
  }))
});

export const buildTempoQuestionsForAttempt = (attempt, difficulty = 'beginner', dateStr = '') => {
  const level = attempt?.difficulty || difficulty;
  const seed = attempt?.vacationDate || dateStr;
  const version = attempt ? attempt.contentVersion || 1 : TEMPO_CONTENT_VERSION;
  const variants = new Map();
  const questions = (selectedLevel, selectedVersion) => {
    const key = `${selectedLevel}-${selectedVersion}`;
    if (!variants.has(key)) variants.set(key, buildTempoQuestions(selectedLevel, seed, selectedVersion));
    return variants.get(key);
  };
  return questions(level, version).map((item, index) => {
    const answer = attempt?.answers?.[index];
    if (!answer) return item;
    return questions(answer.difficulty || level, answer.contentVersion || version).find(candidate => candidate.id === answer.questionId) || item;
  });
};
