import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';

const source = await readFile('src/components/AdminPortal.jsx', 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
const mounts = [];
const text = node => source.slice(...node.range);
function walk(node, guards = []) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'LogicalExpression' && node.operator === '&&') {
    walk(node.left, guards);
    walk(node.right, [...guards, text(node.left)]);
    return;
  }
  if (node.type === 'ConditionalExpression') {
    walk(node.test, guards);
    walk(node.consequent, [...guards, text(node.test)]);
    walk(node.alternate, [...guards, `!(${text(node.test)})`]);
    return;
  }
  if (node.type === 'JSXOpeningElement' && node.name?.name === 'StableModalRenderer'
      && node.attributes.some(attribute => attribute.name?.name === 'render'
        && attribute.value?.expression?.name === 'StudentDossierModalOverlay')) mounts.push(guards);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'range') continue;
    if (Array.isArray(value)) value.forEach(item => walk(item, guards));
    else if (value && typeof value === 'object') walk(value, guards);
  }
}
walk(ast);
const renderedDossiers = (activeTab, studentDossierModal) => mounts.filter(guards => guards.every(guard =>
  vm.runInNewContext(`Boolean(${guard})`, { activeTab, studentDossierModal, activeDeferredErrorEntries: [], activeDeferredLoadingEntries: [] })
)).length;

test('la ficha seleccionada aparece una sola vez en Alumnos y desaparece en el resto del menú', () => {
  assert.equal(renderedDossiers('students', { id: 'alumno-prueba' }), 1);
  for (const tab of ['gestiones', 'mitobox', 'classes', 'danger', 'teachers', 'announcements', 'workshops', 'gamification', 'informes', 'settings']) {
    assert.equal(renderedDossiers(tab, { id: 'alumno-prueba' }), 0, tab);
  }
  assert.equal(renderedDossiers('students', null), 0);
  assert.equal(renderedDossiers('students', { id: 'alumno-prueba' }), 1);
});
