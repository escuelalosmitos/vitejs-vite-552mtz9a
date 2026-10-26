import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, transformWithOxc } from 'vite';
import * as jsxRuntime from 'react/jsx-runtime';
import * as challengeUtils from '../src/components/vacationChallengeUtils.js';
import * as challengeContent from '../src/components/tempoChallengeContent.js';
const { isUnreadVacationAttempt } = challengeUtils;

test('la tarjeta real se renderiza compacta con dos desplegables, sin contador ni previsualización', async () => {
  const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
  try {
    const { default: Card } = await server.ssrLoadModule('/src/components/VacationClassCard.jsx');
    const html = renderToStaticMarkup(createElement(Card, {
      db: {}, appId: 'app', user: {}, student: { id: 'noa' }, classData: { subject: 'Guitarra', time: '18:00', sede: 'Reus' },
      dateStr: '2099-12-24', nextTeachingClass: { dateStr: '2100-01-07', clase: { time: '18:00' } },
      vacationDates: ['2099-12-24'], clock: Date.parse('2099-12-20T12:00:00Z'), onCalendar() {}, onContract() {},
      tasks: createElement('button', { 'aria-expanded': false }, 'Desplegar tareas y recursos')
    }));
    assert.match(html, /Vacaciones/);
    assert.match(html, /cláusulas 3 y 9/);
    assert.match(html, /artículo 22/);
    assert.match(html, /Consultar el calendario completo/);
    assert.match(html, /2100/);
    assert.equal((html.match(/aria-expanded="false"/g) || []).length, 2);
    assert.doesNotMatch(html, /Durante estas vacaciones queremos/);
    assert.doesNotMatch(html, /días de cierre.*restantes|previsualizaci/i);
  } finally { await server.close(); }
});

// Prueba el componente compilado y sus manejadores reales con hooks y servicios
// aislados, sin Firebase ni un dispositivo de audio. No es una prueba visual.
const makePlayer = async (difficulty = 'beginner', initialAttempt) => {
  const source = await readFile('src/components/VacationChallengePlayer.jsx', 'utf8');
  const compiled = (await transformWithOxc(source, 'VacationChallengePlayer.jsx')).code;
  const ast = parse(compiled, { ecmaVersion: 'latest', sourceType: 'module', range: true });
  const slots = [];
  let slot = 0, tree, effects = [], failNext = false;
  const hooks = {
    useState(initial) {
      const index = slot++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = slot++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useMemo(factory) { slot++; return factory(); },
    useEffect(callback, dependencies) {
      const index = slot++;
      if (!slots[index] || dependencies.some((value, i) => !Object.is(value, slots[index][i]))) {
        slots[index] = dependencies; effects.push(callback);
      }
    }
  };
  const student = { id: 'noa', name: 'Noa' };
  const classData = { id: 'guitarra', subject: 'Guitarra', refPath: 'artifacts/app/users/profe/recurringClasses/guitarra' };
  let stored = structuredClone(initialAttempt || challengeUtils.createVacationAttempt({ student, dateStr: '2099-12-24', classData, difficulty }));
  const audioCompletions = [];
  const dependencies = {
    react: hooks, 'react/jsx-runtime': jsxRuntime,
    'lucide-react': new Proxy({}, { get: () => () => null }),
    './tempoChallengeContent.js': challengeContent,
    './tempoChallengeAudio.js': { playTempoClip: async (_clip, { onEnd }) => { audioCompletions.push(onEnd); return () => {}; } },
    './vacationChallengeUtils.js': { ...challengeUtils, readChallengeClock: () => Date.parse('2099-12-20T12:00:00Z') },
    './vacationChallengeStore.js': {
      loadVacationAttempt: async () => structuredClone(stored),
      saveVacationAttempt: async ({ attempt: next, expectedRevision }) => {
        if (failNext) { failNext = false; throw new Error('Fallo de conexión simulado'); }
        assert.equal(expectedRevision, stored.revision);
        stored = { ...structuredClone(next), revision: expectedRevision + 1 };
        return stored;
      }
    }
  };
  const context = {
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setInterval: () => 1, clearInterval() {}
  };
  let executable = '', end = 0;
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      executable += compiled.slice(end, node.range[0]);
      for (const specifier of node.specifiers) context[specifier.local.name] = dependencies[node.source.value][specifier.imported.name];
      end = node.range[1];
    } else if (node.type === 'ExportDefaultDeclaration') {
      executable += compiled.slice(end, node.range[0]); end = node.declaration.range[0];
    }
  }
  executable += compiled.slice(end);
  const Player = vm.runInNewContext(`(() => { ${executable}; return VacationChallengePlayer; })()`, context);
  const props = { db: {}, appId: 'app', user: { email: 'noa@example.com' }, student, dateStr: '2099-12-24', classData, vacationDates: ['2099-12-24'], onClose() {} };
  const render = () => { slot = 0; tree = Player(props); const pending = effects; effects = []; pending.forEach(callback => callback()); };
  const elements = (node = tree) => !node || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(item => elements(item ?? null)) : [node, ...elements(node.props?.children ?? null)];
  const textOf = node => node === null || node === undefined || typeof node === 'boolean' ? '' : typeof node !== 'object'
    ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : textOf(node.props?.children);
  const button = label => elements().find(node => node.type === 'button' && textOf(node).includes(label));
  const click = async node => { assert.ok(node && !node.props.disabled, 'el control debe estar habilitado'); await node.props.onClick(); render(); };
  const selectLevel = async value => { const select = elements().find(node => node.type === 'select'); await select.props.onChange({ target: { value } }); render(); };
  const choose = index => { elements().filter(node => node.type === 'input' && node.props.type === 'radio')[index].props.onChange(); render(); };
  const listenAll = async () => {
    const clips = elements().filter(node => node.type === 'button' && /^Escuchar (versión|fragmento)/.test(textOf(node)));
    for (const node of clips) { await click(node); audioCompletions.at(-1)(); render(); }
  };
  render(); for (let i = 0; i < 4; i++) await Promise.resolve(); render();
  return { render, elements, text: () => textOf(tree), button, click, selectLevel, choose, listenAll,
    saved: () => structuredClone(stored), failNext: () => { failNext = true; } };
};

test('el reproductor permite completar las 36 actividades de ambos niveles y exige escuchar antes de comprobar', async () => {
  for (const level of ['beginner', 'advanced']) {
    const player = await makePlayer(level);
    const questions = challengeContent.buildTempoQuestions(level, '2099-12-24');
    for (const [index, question] of questions.entries()) {
      if (player.button('Vamos a practicar')) await player.click(player.button('Vamos a practicar'));
      player.choose(question.correct);
      assert.equal(player.button('Comprobar respuesta').props.disabled, true, 'seleccionar una opción no basta');
      await player.listenAll();
      assert.equal(player.button('Comprobar respuesta').props.disabled, false);
      await player.click(player.button('Comprobar respuesta'));
      const answer = player.saved().answers[index];
      assert.equal(answer.correct, true); assert.equal(answer.difficulty, level); assert.equal(answer.contentVersion, 2);
      await player.click(player.button(index === 35 ? 'Terminar y ver resultado' : 'Continuar'));
    }
    assert.equal(player.saved().status, 'completed');
    assert.equal(player.saved().answers.length, 36);
    assert.equal(player.elements().some(node => node.type === 'select'), false, 'un reto terminado no cambia de nivel');
  }
});

test('cambiar el nivel de una pregunta pendiente borra selección y escuchas sin borrar respuestas anteriores', async () => {
  const player = await makePlayer();
  await player.click(player.button('Vamos a practicar'));
  player.choose(0); await player.listenAll();
  assert.equal(player.button('Comprobar respuesta').props.disabled, false);
  await player.selectLevel('advanced');
  assert.equal(player.saved().difficulty, 'advanced');
  assert.equal(player.saved().answers.length, 0);
  assert.equal(player.elements().some(node => node.type === 'input' && node.props.type === 'radio' && node.props.checked), false);
  player.choose(0);
  assert.equal(player.button('Comprobar respuesta').props.disabled, true, 'el nivel nuevo requiere sus propias escuchas');
  await player.listenAll(); await player.click(player.button('Comprobar respuesta'));
  const previous = player.saved().answers[0];
  await player.selectLevel('beginner');
  assert.deepEqual(player.saved().answers[0], previous);
  assert.match(player.text(), /conserva su nivel: Más desafío/);
  await player.click(player.button('Continuar'));
  player.choose(0); await player.listenAll(); await player.click(player.button('Comprobar respuesta'));
  assert.deepEqual(player.saved().answers.map(answer => answer.difficulty), ['advanced', 'beginner']);
  const resumed = await makePlayer('beginner', player.saved());
  assert.equal(resumed.elements().find(node => node.type === 'select').props.value, 'beginner');
  assert.equal(resumed.saved().answers.length, 2);
});

test('la pista funciona y un error al guardar dificultad mantiene el nivel anterior', async () => {
  const player = await makePlayer();
  await player.click(player.button('Vamos a practicar'));
  const hint = challengeContent.buildTempoQuestions('beginner', '2099-12-24')[0].hint;
  assert.ok(!player.text().includes(hint));
  await player.click(player.button('Necesito una pista'));
  assert.ok(player.text().includes(hint));
  player.failNext(); await player.selectLevel('advanced');
  assert.equal(player.saved().difficulty, 'beginner');
  assert.equal(player.elements().find(node => node.type === 'select').props.value, 'beginner');
  assert.match(player.text(), /Fallo de conexión/);
});

test('las marcas de leído requieren resultados del servidor y no se aplican a un intento que se ha reiniciado', async () => {
  const source = await readFile('src/components/VacationChallengeResults.jsx', 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
  const component = ast.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
  const effect = component.body.body.find(node => node.type === 'ExpressionStatement' && node.expression.callee?.name === 'useEffect'
    && source.slice(...node.expression.arguments[0].range).includes('const unread'));
  const code = source.slice(...effect.expression.arguments[0].range);
  const attempts = [
    { id: 'completed-new', status: 'completed', completedAt: { seconds: 100 } },
    { id: 'partial', status: 'in_progress' },
    { id: 'completed-seen', status: 'completed', completedAt: { seconds: 90 }, adminSeenBy: { admin: true } }
  ];
  for (const [loaded, serverLoaded, expected, reset] of [[false, false, 0, false], [true, false, 0, false], [true, true, 1, false], [true, true, 0, true]]) {
    const updates = [];
    const pending = [];
    const callback = vm.runInNewContext(`(${code})`, {
      loaded, serverLoaded, adminUid: 'admin', attempts, db: {}, appId: 'app',
      marking: { current: new Set() }, isUnreadVacationAttempt, timestampMillis: challengeUtils.timestampMillis,
      doc: (_db, ...parts) => parts.join('/'), FieldPath: class { constructor(...parts) { this.parts = parts; } },
      serverTimestamp: () => 'now', setError: () => {},
      runTransaction: (_db, callback) => {
        const work = callback({
          get: async path => ({ exists: () => true, data: () => reset ? { status: 'in_progress', revision: 10 } : attempts.find(item => path.endsWith(item.id)) }),
          update: (...args) => updates.push(args)
        }); pending.push(work); return work;
      }
    });
    callback();
    await Promise.all(pending);
    assert.equal(updates.length, expected);
    if (expected) assert.match(updates[0][0], /completed-new$/);
    await Promise.resolve();
  }
  const admin = await readFile('src/components/AdminPortal.jsx', 'utf8');
  assert.match(admin, /section === 'music-challenges' && <VacationChallengeResults/);
  assert.match(admin, /label: 'Alumnos \(CRM\)', notificationCount: unreadVacationStudentIds.size/);
  assert.match(admin, /aria-label="Resultados nuevos de retos musicales"/);
});

const resultsSource = await readFile('src/components/VacationChallengeResults.jsx', 'utf8');
const resultsAst = parse(resultsSource, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
const resultsComponent = resultsAst.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
const resetNode = resultsComponent.body.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'resetAttempt').declarations[0].init;
const resetCode = resultsSource.slice(...resetNode.range);

const makeReset = (options = {}) => {
  const initial = options.initial || {
    id: 'noa_2099-12-24', studentId: 'noa', studentEmail: 'noa@example.com', studentName: 'Noa',
    vacationDate: '2099-12-24', subject: 'Guitarra', difficulty: 'advanced', challengeId: 'tempo-v1',
    status: 'completed', cursor: 36, answers: [{ questionId: 'tempo-0' }], revision: 9,
    elapsedSeconds: 1000, answered: 36, firstCorrect: 20, finalCorrect: 34, withHelp: 4,
    startedAt: { seconds: 1 }, completedAt: { seconds: 99 }, adminSeenBy: { admin: true }
  };
  let stored = structuredClone(initial), calls = 0, writes = 0, fail = Boolean(options.fail);
  const state = {};
  const context = {
    resetCandidate: options.candidate === undefined ? initial : options.candidate,
    studentId: 'noa', adminUid: 'admin', resetLock: { current: false }, db: {}, appId: 'app',
    TEMPO_CONTENT_VERSION: challengeContent.TEMPO_CONTENT_VERSION,
    buildVacationAttemptId: challengeUtils.buildVacationAttemptId,
    doc: (_db, ...parts) => parts.join('/'), serverTimestamp: () => ({ serverTimestamp: true }),
    runTransaction: async (_db, callback) => {
      calls++;
      if (options.hold) await options.hold;
      if (fail) { fail = false; throw new Error('Sin conexión'); }
      await callback({
        get: async () => ({ exists: () => true, data: () => structuredClone(stored) }),
        set: (path, value) => { assert.equal(path, 'artifacts/app/vacationChallengeAttempts/noa_2099-12-24'); writes++; stored = structuredClone(value); }
      });
    }
  };
  for (const key of ['Resetting', 'ResetError', 'ResetMessage', 'Expanded', 'ResetCandidate']) {
    context[`set${key}`] = value => { state[key] = value; if (key === 'ResetCandidate') context.resetCandidate = value; };
  }
  const reset = vm.runInNewContext(`(${resetCode})`, context);
  return { reset, state, context, initial, stored: () => stored, calls: () => calls, writes: () => writes };
};

test('reiniciar desde CRM vacía sólo ese intento y aumenta la revisión para rechazar guardados antiguos', async () => {
  const action = makeReset();
  await action.reset();
  const clean = action.stored();
  assert.equal(action.writes(), 1);
  assert.equal(clean.status, 'in_progress');
  for (const key of ['cursor', 'elapsedSeconds', 'answered', 'firstCorrect', 'finalCorrect', 'withHelp']) assert.equal(clean[key], 0);
  assert.deepEqual(clean.answers, []);
  assert.equal(clean.revision, action.initial.revision + 1);
  assert.equal(clean.contentVersion, 2);
  assert.equal(clean.completedAt, undefined); assert.equal(clean.adminSeenBy, undefined);
  for (const key of ['studentId', 'studentEmail', 'vacationDate', 'difficulty', 'subject']) assert.equal(clean[key], action.initial[key]);
  assert.equal(action.state.ResetCandidate, null); assert.equal(action.state.Resetting, false);
  assert.match(action.state.ResetMessage, /vuelve a abrirlo/);
  assert.equal(action.initial.firstCorrect, 20);

  const storeSource = await readFile('src/components/vacationChallengeStore.js', 'utf8');
  const ast = parse(storeSource, { ecmaVersion: 'latest', sourceType: 'module', range: true });
  const node = ast.body.find(item => item.type === 'ExportNamedDeclaration' && item.declaration?.declarations?.[0]?.id.name === 'saveVacationAttempt').declaration.declarations[0].init;
  const save = vm.runInNewContext(`(${storeSource.slice(...node.range)})`, {
    isVacationChallengeOpen: challengeUtils.isVacationChallengeOpen,
    vacationAttemptRef: () => ({}),
    runTransaction: async (_db, callback) => callback({ get: async () => ({ exists: () => true, data: () => clean }), set: () => assert.fail('Una pestaña obsoleta no debe guardar') })
  });
  await assert.rejects(save({ db: {}, appId: 'app', attempt: action.initial, expectedRevision: action.initial.revision, vacationDates: ['2099-12-24'] }), /otra pestaña/);
});

test('el reinicio exige confirmación y no afecta a otro alumno ni a otro intento', async () => {
  for (const candidate of [null, { id: 'otro_2099-12-24', studentId: 'otro', vacationDate: '2099-12-24' }, { id: 'noa_2099-12-31', studentId: 'noa', vacationDate: '2099-12-24' }]) {
    const action = makeReset({ candidate }); await action.reset(); assert.equal(action.calls(), 0);
  }
  const action = makeReset(); action.context.adminUid = ''; await action.reset(); assert.equal(action.calls(), 0);
  assert.match(resultsSource, /onClick=\{\(\) => \{ setResetCandidate\(attempt\)/);
  assert.match(resultsSource, /onClick=\{resetAttempt\}/);
  assert.match(resultsSource, /onClick=\{\(\) => setResetCandidate\(null\)\}/);
  const wrongData = makeReset({ initial: { id: 'noa_2099-12-24', studentId: 'otro', vacationDate: '2099-12-24' }, candidate: { id: 'noa_2099-12-24', studentId: 'noa', vacationDate: '2099-12-24' } });
  await wrongData.reset(); assert.equal(wrongData.writes(), 0); assert.match(wrongData.state.ResetError, /No se ha podido/);
});

test('un fallo de reinicio conserva los datos y permite reintentarlo', async () => {
  const action = makeReset({ fail: true });
  await action.reset();
  assert.equal(action.writes(), 0); assert.equal(action.stored().status, 'completed');
  assert.equal(action.state.Resetting, false); assert.match(action.state.ResetError, /No se ha podido reiniciar/);
  await action.reset(); assert.equal(action.writes(), 1); assert.equal(action.stored().cursor, 0);
});

test('un doble clic de confirmación no reinicia dos veces', async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const action = makeReset({ hold });
  const pending = action.reset();
  await action.reset(); assert.equal(action.calls(), 1);
  release(); await pending;
  assert.equal(action.writes(), 1); assert.equal(action.stored().revision, 10);
});


test('reiniciar un juego generado conserva su identidad, semilla y posición sin avanzar el catálogo', async () => {
  const initial = {
    id: 'noa_2099-12-24', studentId: 'noa', vacationDate: '2099-12-24', difficulty: 'advanced',
    challengeId: 'composer-v1', challengeTitle: 'Misión compositor', seed: '123456', generatorVersion: 1,
    contentVersion: 3, totalActivities: 16, sequenceOrdinal: 6, revision: 4, status: 'completed',
    answers: [{ questionId: 'composer-v1-0', submission: ['A', 'B', 'S', 'A'] }], cursor: 16,
    completedAt: { seconds: 10 }, adminSeenBy: { admin: true }
  };
  const action = makeReset({ initial }); await action.reset();
  const reset = action.stored();
  for (const key of ['challengeId', 'challengeTitle', 'seed', 'generatorVersion', 'contentVersion', 'totalActivities', 'sequenceOrdinal']) assert.equal(reset[key], initial[key]);
  assert.equal(reset.revision, 5); assert.equal(reset.cursor, 0); assert.deepEqual(reset.answers, []);
});
