import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { isUnreadVacationAttempt } from '../src/components/vacationChallengeUtils.js';

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

test('las marcas de leído sólo se escriben tras cargar resultados del servidor en su pestaña', async () => {
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
  for (const [loaded, serverLoaded, expected] of [[false, false, 0], [true, false, 0], [true, true, 1]]) {
    const updates = [];
    const callback = vm.runInNewContext(`(${code})`, {
      loaded, serverLoaded, adminUid: 'admin', attempts, db: {}, appId: 'app',
      marking: { current: new Set() }, isUnreadVacationAttempt,
      doc: (_db, ...parts) => parts.join('/'), FieldPath: class { constructor(...parts) { this.parts = parts; } },
      serverTimestamp: () => 'now', setError: () => {},
      writeBatch: () => ({ update: (...args) => updates.push(args), commit: async () => {} })
    });
    callback();
    assert.equal(updates.length, expected);
    if (expected) assert.match(updates[0][0], /completed-new$/);
    await Promise.resolve();
  }
  const admin = await readFile('src/components/AdminPortal.jsx', 'utf8');
  assert.match(admin, /section === 'music-challenges' && <VacationChallengeResults/);
  assert.match(admin, /label: 'Alumnos \(CRM\)', notificationCount: unreadVacationStudentIds.size/);
  assert.match(admin, /aria-label="Resultados nuevos de retos musicales"/);
});
