import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parse } from 'espree';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import * as catalog from '../src/components/musicChallengeCatalog.js';
import * as utils from '../src/components/vacationChallengeUtils.js';
import { generateMusicQuestions, musicLessons, musicBuilderChecks, buildMusicQuestionsForAttempt, musicSubmissionClip } from '../src/components/musicChallengeContent.js';
import { buildMusicAudioEvents, playMusicClip } from '../src/components/musicChallengeAudio.js';
import { buildTempoQuestionsForAttempt } from '../src/components/tempoChallengeContent.js';

const dates = Array.from({ length: 20 }, (_, index) => `2099-12-${String(index + 1).padStart(2, '0')}`);
const student = { id: 'noa', email: 'noa@example.com', name: 'Noa' };
const classData = { id: 'guitar', subject: 'Guitarra', refPath: 'artifacts/app/users/profe/recurringClasses/guitar' };

test('siete juegos cíclicos, orden validado y recuento de vacaciones sin duplicados ni festivos', () => {
  assert.equal(catalog.MUSIC_GAMES.length, 7);
  let state = null; const assigned = [];
  for (let index = 0; index < 15; index++) {
    const next = catalog.nextMusicAssignment(state); assigned.push(next.challengeId);
    state = { lastChallengeId: next.challengeId, nextOrdinal: next.sequenceOrdinal + 1 };
  }
  assert.deepEqual(assigned.slice(0, 7), catalog.DEFAULT_MUSIC_ORDER);
  assert.deepEqual(assigned.slice(7, 14), catalog.DEFAULT_MUSIC_ORDER);
  assert.equal(assigned[14], 'tempo-v1');
  const reversed = [...catalog.DEFAULT_MUSIC_ORDER].reverse();
  assert.equal(catalog.nextMusicAssignment({ lastChallengeId: 'composer-v1', nextOrdinal: 7 }, reversed).challengeId, 'layers-v1');
  assert.deepEqual(catalog.normalizeMusicOrder(['tempo-v1', 'tempo-v1']), catalog.DEFAULT_MUSIC_ORDER);
  const counts = catalog.musicVacationCounts(['2026-12-24', '2026-12-24', '2026-12-25', '2027-01-01', '2026-02-31'], '2026');
  assert.equal(counts[4], 1); assert.equal(counts[5], 1); assert.equal(counts.reduce((a, b) => a + b), 2);
});

test('todos los juegos y niveles generan contenido reproducible, distinto por semilla y audio válido', () => {
  for (const game of catalog.MUSIC_GAMES) for (const difficulty of ['beginner', 'advanced']) {
    let baseline;
    for (let seed = 0; seed < 30; seed++) {
      const config = { challengeId: game.id, difficulty, seed: String(seed) };
      const questions = generateMusicQuestions(config);
      assert.deepEqual(questions, generateMusicQuestions(config));
      if (!seed) baseline = JSON.stringify(questions); else assert.notEqual(JSON.stringify(questions), baseline);
      assert.equal(questions.length, game.total);
      assert.equal(new Set(questions.map(question => question.id)).size, game.total);
      assert.deepEqual([...new Set(questions.map(question => question.chapter))], [0, 1, 2, 3]);
      assert.equal(musicLessons(game.id).length, 4);
      for (const question of questions) {
        assert.ok(question.prompt && question.hint && question.explanation);
        assert.ok(question.correct >= 0 && question.correct < question.options.length);
        for (const clip of question.clips) {
          const audio = buildMusicAudioEvents(clip);
          assert.ok(audio.duration > 0 && audio.duration < 25);
          assert.ok(audio.events.length > 0);
          audio.events.forEach(event => {
            assert.ok(event.frequency > 20 && event.frequency < 5000);
            assert.ok(event.at >= 0 && event.at < audio.duration);
            assert.ok(event.duration > 0 && event.gain > 0 && event.gain <= 0.3);
          });
        }
        if (question.id.startsWith('tempo-')) assert.equal(question.options[question.correct], question.clips[0].bpm > question.clips[1].bpm ? 'La versión A' : 'La versión B');
        if (question.id.startsWith('echo-')) {
          assert.deepEqual(question.clips[question.correct + 1], question.clips[0]);
          question.clips.slice(1).forEach((clip, index) => { if (index !== question.correct) assert.notDeepEqual(clip.notes, question.clips[0].notes); });
        }
        if (question.id.startsWith('contour-')) {
          const notes = question.clips[0].notes.map(note => note.note);
          const path = notes.slice(1).map((note, index) => note > notes[index] ? '↑' : note < notes[index] ? '↓' : '=').join(' ');
          assert.equal(question.options[question.correct], path);
        }
        if (question.id.startsWith('layers-')) {
          const missing = question.clips.length === 1 ? question.clips[0].activeLayers[0] : question.clips[0].activeLayers.find(layer => !question.clips[1].activeLayers.includes(layer));
          assert.equal(question.options[question.correct], { melody: 'Melodía', bass: 'Bajo', harmony: 'Acompañamiento', percussion: 'Percusión' }[missing]);
        }
        if (question.kind === 'builder' && question.builder !== 'composer') {
          assert.ok(musicBuilderChecks(question, question.solution).every(check => check.ok));
          assert.deepEqual(musicSubmissionClip(question, question.solution), question.clips.at(-1));
          const wrong = [...question.solution]; wrong[0] = question.palette.find(value => value !== wrong[0]);
          assert.equal(musicBuilderChecks(question, wrong).every(check => check.ok), false);
          assert.equal(musicBuilderChecks(question, []).every(check => check.ok), false);
        }
        if (question.builder === 'composer') {
          const solution = [question.rules.start, question.rules.end && question.rules.start === 'A' ? 'B' : question.rules.start, question.rules.silence ? 'S' : 'C', question.rules.end || (question.rules.start === 'A' ? 'B' : 'A')];
          while (solution.length < question.length) solution.splice(1, 0, 'C');
          assert.ok(musicBuilderChecks(question, solution).every(check => check.ok), JSON.stringify(question.rules));
          assert.equal(musicBuilderChecks(question, Array(question.length).fill('A')).every(check => check.ok), false);
          assert.ok(buildMusicAudioEvents(musicSubmissionClip(question, solution)).duration > 0);
        }
      }
    }
  }
});

test('cambiar dificultad conserva preguntas contestadas, semilla y compatibilidad con partidas antiguas', () => {
  for (const game of catalog.MUSIC_GAMES) {
    const attempt = { challengeId: game.id, seed: '42', generatorVersion: 1, contentVersion: 3, difficulty: 'beginner', answers: [] };
    const easy = buildMusicQuestionsForAttempt(attempt);
    const answer = utils.recordVacationAnswer(null, easy[0], 0);
    const mixed = buildMusicQuestionsForAttempt({ ...attempt, difficulty: 'advanced', answers: [answer] });
    assert.deepEqual(mixed[0], easy[0]); assert.equal(mixed[1].difficulty, 'advanced');
  }
  for (const contentVersion of [1, 2]) {
    const old = { challengeId: 'tempo-v1', contentVersion, vacationDate: dates[0], difficulty: 'beginner', answers: [] };
    assert.deepEqual(buildMusicQuestionsForAttempt(old), buildTempoQuestionsForAttempt(old));
  }
});

const storeSource = await readFile('src/components/musicChallengeStore.js', 'utf8');
const ast = parse(storeSource, { ecmaVersion: 'latest', sourceType: 'module', range: true });
const makeStore = (initial = []) => {
  const documents = new Map(initial); let writes = 0; const versions = new Map();
  const reference = (...parts) => ({ path: parts.join('/'), id: parts.at(-1) });
  const snapshot = ref => ({ id: ref.id, exists: () => documents.has(ref.path), data: () => structuredClone(documents.get(ref.path)) });
  const dependencies = {
    ...utils, ...catalog, db: {}, structuredClone,
    doc: (_db, ...parts) => reference(...parts), collection: (_db, ...parts) => reference(...parts),
    query: (ref, filter) => ({ ...ref, filter }), where: (key, operator, value) => ({ key, operator, value }),
    vacationAttemptRef: (_db, app, id, date) => reference('artifacts', app, 'vacationChallengeAttempts', `${id}_${date}`),
    progressRef: (_db, app, id) => reference('artifacts', app, 'studentMusicProgress', id),
    getDoc: async ref => snapshot(ref), serverTimestamp: () => ({ seconds: 4102444800 }),
    getDocs: async ref => ({ docs: [...documents].filter(([path, value]) => path.startsWith(`${ref.path}/`) && value[ref.filter.key] === ref.filter.value).map(([path]) => snapshot(reference(...path.split('/')))) }),
    runTransaction: async (_db, callback) => {
      for (let retry = 0; retry < 5; retry++) {
        const reads = new Map(), pending = [];
        const result = await callback({ get: async ref => { reads.set(ref.path, versions.get(ref.path) || 0); return snapshot(ref); }, set: (ref, value, options) => pending.push({ ref, value, options }) });
        if ([...reads].some(([path, version]) => version !== (versions.get(path) || 0))) continue;
        for (const { ref, value, options } of pending) { documents.set(ref.path, structuredClone(options?.merge ? { ...documents.get(ref.path), ...value } : value)); versions.set(ref.path, (versions.get(ref.path) || 0) + 1); writes++; }
        return result;
      }
      throw new Error('Conflicto');
    }
  };
  const context = vm.createContext(dependencies);
  for (const node of ast.body) if (node.type === 'ExportNamedDeclaration' && node.declaration?.declarations) {
    const variable = node.declaration.declarations[0]; context[variable.id.name] = vm.runInContext(`(${storeSource.slice(...variable.init.range)})`, context);
  }
  documents.set('artifacts/app/roleData/studentSettings', { vacaciones: dates });
  return { context, documents, writes: () => writes,
    load: date => context.loadMusicSession({}, 'app', student.id, date),
    start: (date, extra = {}) => context.startMusicAttempt({ db: {}, appId: 'app', student, classData, dateStr: date, difficulty: 'beginner', ...extra }),
    save: attempt => context.saveMusicAttempt({ db: {}, appId: 'app', attempt, expectedRevision: attempt.revision, vacationDates: dates }) };
};

test('abrir sin empezar no consume juego, inicio atómico y doble pestaña no consume dos posiciones', async () => {
  const store = makeStore();
  const session = await store.load(dates[0]); assert.equal(session.assignment.challengeId, 'tempo-v1'); assert.equal(store.writes(), 0);
  const [first, again] = await Promise.all([store.start(dates[0]), store.start(dates[0])]);
  assert.equal(first.seed, again.seed); assert.equal(store.writes(), 2);
  assert.equal(store.documents.get('artifacts/app/studentMusicProgress/noa').nextOrdinal, 1);
  assert.equal((await store.load(dates[0])).attempt.challengeId, 'tempo-v1');
  const pending = await store.load(dates[1]); assert.equal(pending.assignment.challengeId, 'echo-v1'); assert.equal(store.writes(), 2);
});

test('incompletos avanzan en la próxima fecha, catálogo vuelve al primero con semilla nueva y persiste entre años', async () => {
  const store = makeStore(); const attempts = [];
  for (let index = 0; index < 8; index++) attempts.push(await store.start(dates[index]));
  assert.deepEqual(attempts.map(attempt => attempt.challengeId), [...catalog.DEFAULT_MUSIC_ORDER, 'tempo-v1']);
  assert.notEqual(attempts[0].seed, attempts[7].seed);
  assert.equal(attempts.every(attempt => attempt.status === 'in_progress'), true);
  assert.equal(store.documents.get('artifacts/app/studentMusicProgress/noa').nextOrdinal, 8);
  store.documents.get('artifacts/app/roleData/studentSettings').vacaciones.push('2100-01-01');
  assert.equal((await store.start('2100-01-01')).challengeId, 'echo-v1');
});

test('migración conserva intentos antiguos y continúa después del último juego iniciado; respeta orden nuevo', async () => {
  const legacy = { ...utils.createVacationAttempt({ student, classData, dateStr: dates[0], difficulty: 'beginner' }), startedAt: { seconds: 10 } };
  const store = makeStore([[`artifacts/app/vacationChallengeAttempts/noa_${dates[0]}`, legacy]]);
  assert.equal((await store.load(dates[0])).attempt.contentVersion, 2);
  const session = await store.load(dates[1]); assert.equal(session.assignment.challengeId, 'echo-v1');
  await store.start(dates[1], { previous: session.previous });
  store.documents.get('artifacts/app/roleData/studentSettings').musicChallengeOrder = [...catalog.DEFAULT_MUSIC_ORDER].reverse();
  assert.equal((await store.start(dates[2])).challengeId, 'tempo-v1');
  assert.equal(store.documents.get(`artifacts/app/vacationChallengeAttempts/noa_${dates[0]}`).contentVersion, 2);
});

test('guardado conserva identidad, rechaza revisiones antiguas y no avanza la secuencia al responder', async () => {
  const store = makeStore(); const attempt = await store.start(dates[0]);
  const question = buildMusicQuestionsForAttempt(attempt)[0];
  const wrong = utils.recordVacationAnswer(null, question, (question.correct + 1) % question.options.length);
  const saved = await store.save({ ...attempt, answers: [wrong] });
  assert.equal(saved.firstCorrect, 0); assert.equal(saved.revision, 1);
  assert.equal(store.documents.get('artifacts/app/studentMusicProgress/noa').nextOrdinal, 1);
  await assert.rejects(store.save(attempt), /otra pestaña/);
  await assert.rejects(store.save({ ...saved, seed: 'other' }), /identidad/);
  await assert.rejects(store.save({ ...saved, status: 'completed', cursor: 36 }), /pendientes/);
  const retry = utils.recordVacationAnswer(wrong, question, question.correct);
  const fixed = await store.save({ ...saved, answers: [retry] });
  assert.equal(fixed.firstCorrect, 0); assert.equal(fixed.finalCorrect, 1); assert.equal(fixed.withHelp, 1);
  assert.equal(fixed.seed, attempt.seed);
  await assert.rejects(store.start('2099-11-30'), /vacaciones/);
});

test('audio sólo confirma escucha al completar el fragmento; cancelar o error no desbloquea', async () => {
  let marker, closes = 0, finished = 0;
  class Context {
    currentTime = 0; destination = {};
    async resume() {} async close() { closes++; }
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createOscillator() { const oscillator = { frequency: {}, connect() {}, start() {}, stop() {} }; marker = oscillator; return oscillator; }
  }
  globalThis.window = { AudioContext: Context };
  try {
    const clip = generateMusicQuestions({ challengeId: 'echo-v1', seed: '1' })[0].clips[0];
    const cancel = await playMusicClip(clip, { onEnd: () => finished++ });
    assert.equal(finished, 0); cancel(); marker.onended(); assert.equal(finished, 0);
    await playMusicClip(clip, { onEnd: () => finished++ }); marker.onended(); assert.equal(finished, 1); assert.equal(closes, 2);
  } finally { delete globalThis.window; }
});

test('componentes reales renderizan los siete juegos y el panel de pruebas sin escribir resultados', async () => {
  const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
  try {
    const { default: Admin } = await server.ssrLoadModule('/src/components/VacationChallengesAdmin.jsx');
    const html = renderToStaticMarkup(createElement(Admin, { settings: { vacaciones: dates }, onSaved() {} }));
    for (const game of catalog.MUSIC_GAMES) assert.ok(html.includes(game.title));
    assert.match(html, /Generar otra variante/); assert.match(html, /Guardar orden/); assert.match(html, /Vacaciones por día/);
    const { default: Player } = await server.ssrLoadModule('/src/components/MusicChallengePlayer.jsx');
    for (const game of catalog.MUSIC_GAMES) {
      const output = renderToStaticMarkup(createElement(Player, { preview: { gameId: game.id, difficulty: 'advanced', seed: '1' }, onClose() {} }));
      assert.ok(output.includes(game.title)); assert.match(output, /Modo de prueba/); assert.match(output, /Empezar mi reto/);
    }
  } finally { await server.close(); }
});

// Ejecuta los manejadores del componente real compilado. Hooks, audio y Firebase
// se aíslan; no pretende sustituir una prueba visual ni el emulador de reglas.
const makePlayer = async ({ gameId = 'tempo-v1', difficulty = 'beginner', seed = '42', real = false } = {}) => {
  const { transformWithOxc } = await import('vite');
  const runtime = await import('react/jsx-runtime');
  const content = await import('../src/components/musicChallengeContent.js');
  const source = await readFile('src/components/MusicChallengePlayer.jsx', 'utf8');
  const compiled = (await transformWithOxc(source, 'MusicChallengePlayer.jsx')).code;
  const ast = parse(compiled, { ecmaVersion: 'latest', sourceType: 'module', range: true });
  const slots = []; let slot = 0, effects = [], tree, writes = 0, fail = false;
  const audio = [];
  const hooks = {
    useState(initial) { const index = slot++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = slot++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useMemo(factory) { slot++; return factory(); },
    useEffect(callback, dependencies) { const index = slot++; if (!slots[index] || dependencies.some((value, at) => !Object.is(value, slots[index][at]))) { slots[index] = dependencies; effects.push(callback); } }
  };
  const newAttempt = () => ({ challengeId: gameId, difficulty, seed, generatorVersion: 1, contentVersion: 3, totalActivities: catalog.getMusicGame(gameId).total, sequenceOrdinal: 0, vacationDate: dates[0], answers: [], cursor: 0, status: 'in_progress', revision: 0, elapsedSeconds: 0 });
  const dependencies = {
    react: hooks, 'react/jsx-runtime': runtime, 'lucide-react': new Proxy({}, { get: () => () => null }),
    './musicChallengeCatalog.js': catalog, './musicChallengeContent.js': content,
    './vacationChallengeUtils.js': { ...utils, readChallengeClock: () => Date.parse('2099-11-30T12:00:00Z') },
    './musicChallengeAudio.js': { playMusicClip: async (_clip, { onEnd }) => { audio.push(onEnd); return () => {}; } },
    './musicChallengeStore.js': {
      startMusicAttempt: async () => { assert.ok(real, 'Una prueba de admin no debe escribir en Firebase'); writes++; return newAttempt(); },
      saveMusicAttempt: async ({ attempt, expectedRevision }) => { assert.ok(real); if (fail) { fail = false; throw new Error('Conexión perdida'); } writes++; assert.equal(attempt.revision, expectedRevision); return { ...attempt, revision: expectedRevision + 1 }; }
    }
  };
  const context = { document: { hidden: false, addEventListener() {}, removeEventListener() {} }, setInterval: () => 1, clearInterval() {} };
  let code = '', end = 0;
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      code += compiled.slice(end, node.range[0]);
      for (const specifier of node.specifiers) context[specifier.local.name] = dependencies[node.source.value][specifier.imported.name];
      end = node.range[1];
    } else if (node.type === 'ExportDefaultDeclaration') { code += compiled.slice(end, node.range[0]); end = node.declaration.range[0]; }
  }
  code += compiled.slice(end); code += '\n globalThis.Player = MusicChallengePlayer;';
  vm.runInNewContext(code, context);
  const props = { ...(real ? { db: {}, appId: 'app', user: { email: student.email }, student, classData, vacationDates: dates, dateStr: dates[0], session: { assignment: { challengeId: gameId } } } : { preview: { gameId, difficulty, seed } }), onClose() {} };
  const render = () => { slot = 0; tree = context.Player(props); const pending = effects; effects = []; pending.forEach(effect => effect()); return tree; };
  const nodes = () => { const all = []; const visit = value => { if (Array.isArray(value)) return value.forEach(visit); if (!value || typeof value !== 'object') return; if (value.props) { all.push(value); visit(value.props.children); } }; visit(tree); return all; };
  const text = node => { const value = node?.props?.children; return typeof value === 'string' ? value : Array.isArray(value) ? value.filter(part => typeof part === 'string').join('') : ''; };
  const button = label => nodes().find(node => node.type === 'button' && text(node).trim() === label);
  const press = async label => { const target = button(label); assert.ok(target, `Botón ${label}`); assert.ok(!target.props.disabled, `${label} debe estar habilitado`); await target.props.onClick(); render(); };
  const hearAll = async () => {
    for (const node of nodes().filter(node => node.props.clipKey)) { node.props.onToggle(node.props.clip, node.props.clipKey); await Promise.resolve(); audio.at(-1)(); render(); }
  };
  render();
  return { render, nodes, press, button, hearAll, writes: () => writes, failNext: () => { fail = true; } };
};

const composerSolution = question => {
  const values = [question.rules.start, question.rules.end && question.rules.start === 'A' ? 'B' : question.rules.start, question.rules.silence ? 'S' : 'C', question.rules.end || (question.rules.start === 'A' ? 'B' : 'A')];
  while (values.length < question.length) values.splice(1, 0, 'C');
  return values;
};

test('los siete jugadores reales permiten terminar en ambos niveles; escuchar es obligatorio y las pruebas no escriben', async () => {
  for (const game of catalog.MUSIC_GAMES) for (const difficulty of ['beginner', 'advanced']) {
    const player = await makePlayer({ gameId: game.id, difficulty });
    await player.press('Empezar mi reto');
    const questions = generateMusicQuestions({ challengeId: game.id, seed: '42', difficulty });
    for (let index = 0; index < questions.length; index++) {
      const question = questions[index];
      if (player.button('Vamos a practicar')) await player.press('Vamos a practicar');
      assert.equal(player.button('Comprobar respuesta').props.disabled, true);
      if (question.kind === 'builder') {
        const values = question.builder === 'composer' ? composerSolution(question) : question.solution;
        for (let at = 0; at < values.length; at++) {
          const select = player.nodes().find(node => node.props['aria-label'] === `Posición ${at + 1}`);
          select.props.onChange({ target: { value: values[at] } }); player.render();
        }
      } else {
        const radio = player.nodes().filter(node => node.type === 'input' && node.props.type === 'radio')[question.correct];
        radio.props.onChange(); player.render();
      }
      assert.equal(player.button('Comprobar respuesta').props.disabled, true, 'Seleccionar no sustituye la escucha');
      await player.hearAll();
      assert.equal(player.button('Comprobar respuesta').props.disabled, false, `${game.id} ${difficulty} ${index}`);
      await player.press('Comprobar respuesta');
      assert.ok(!player.button('Probar otra vez'), `${game.id} debe aceptar la solución válida`);
      await player.press(index === questions.length - 1 ? 'Terminar y ver resultado' : 'Continuar');
    }
    assert.ok(player.button('Cerrar reto')); assert.equal(player.writes(), 0);
  }
});

test('fallo de guardado no avanza ni pierde respuesta; pistas y cambio de dificultad funcionan en el jugador real', async () => {
  const player = await makePlayer({ real: true });
  await player.press('Empezar mi reto'); await player.press('Vamos a practicar');
  const select = player.nodes().find(node => node.props['aria-label'] === 'Dificultad de las actividades pendientes');
  await select.props.onChange({ target: { value: 'advanced' } }); player.render();
  const question = generateMusicQuestions({ challengeId: 'tempo-v1', difficulty: 'advanced', seed: '42' })[0];
  await player.press('Necesito una pista');
  const radios = player.nodes().filter(node => node.type === 'input' && node.props.type === 'radio'); radios[question.correct].props.onChange(); player.render();
  await player.hearAll(); player.failNext(); await player.press('Comprobar respuesta');
  assert.ok(player.button('Comprobar respuesta')); assert.ok(!player.button('Continuar'));
  await player.press('Comprobar respuesta'); assert.ok(player.button('Continuar'));
});
