import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const rules = await readFile('firestore.rules', 'utf8');
const storage = await readFile('storage.rules', 'utf8');
const portal = await readFile('src/components/StudentPortal.jsx', 'utf8');
const avatarFunction = rules.match(/function validStudentAvatarPath\(studentId, avatarPath\) \{([\s\S]*?)\n    \}/)[1]
  .replace('avatarPath is string', "typeof avatarPath === 'string'");
const storageFunction = storage.match(/function validAvatarName\(fileName\) \{([\s\S]*?)\n    \}/)[1];
const guard = rules.match(/&& \(!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasAny\(\['avatarPath'\]\)([\s\S]*?)\n      \);/)[0]
  .replace(/^&& /, '').replace(/\n      \);$/, '');

const uid = 'student-uid';
const studentId = 'student-id';
const evaluate = (expression, values = {}) => {
  const context = vm.createContext({ request: { auth: { uid } }, ...values });
  vm.runInContext(`
    String.prototype.matches = function(pattern) { return new RegExp(pattern).test(this); };
    Array.prototype.size = function() { return this.length; };
    function validStudentAvatarPath(studentId, avatarPath) { ${avatarFunction} }
    function validAvatarName(fileName) { ${storageFunction} }
  `, context);
  return vm.runInContext(expression, context);
};
const pathAllowed = path => evaluate(`validStudentAvatarPath(${JSON.stringify(studentId)}, ${JSON.stringify(path)})`);
const path = name => `studentAvatars/${uid}/${studentId}/${name}`;

test('Firestore admite la foto antigua y el nombre con fecha que genera StudentPortal', () => {
  assert.equal(pathAllowed(path('profile.webp')), true);
  assert.equal(pathAllowed(path('profile-1792670400000.webp')), true);
  assert.match(portal, /profile-\$\{avatarVersion\}\.webp/);
});

test('cambiar una foto no permite rutas ajenas, subcarpetas ni otros tipos de archivo', () => {
  for (const candidate of [
    'studentAvatars/otro-uid/student-id/profile.webp',
    'studentAvatars/student-uid/otro-alumno/profile.webp',
    'studentAvatarsX/student-uid/student-id/profile.webp',
    path('profile-no-fecha.webp'), path('profile-123.png'), path('otro.webp'),
    path('profile-123Xwebp'), path('profile-123.webp/extra'), '', null, 123
  ]) assert.equal(pathAllowed(candidate), false, String(candidate));
});

function canUpdateAvatarFields(before, after) {
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => before[key] !== after[key]);
  const nextData = { ...after, diff: () => ({ affectedKeys: () => ({ hasAny: keys => keys.some(key => changed.includes(key)) }) }) };
  return evaluate(guard, {
    studentId,
    request: { auth: { uid }, resource: { data: nextData } }, resource: { data: before }
  });
}

test('reproduce el inicio de sesión con foto guardada: claimed/authUid no revalidan la ruta', () => {
  for (const avatarPath of [path('profile-1792670400000.webp'), path('profile.webp'), 'ruta-heredada-existente.webp']) {
    const before = { avatarPath, claimed: false };
    assert.equal(canUpdateAvatarFields(before, { ...before, claimed: true, authUid: uid }), true);
  }
});

test('el control se aplica al añadir/cambiar foto y permite eliminarla', () => {
  const before = { avatarPath: path('profile.webp') };
  assert.equal(canUpdateAvatarFields(before, { avatarPath: path('profile-123.webp') }), true);
  assert.equal(canUpdateAvatarFields(before, { avatarPath: path('otro.webp') }), false);
  assert.equal(canUpdateAvatarFields(before, {}), true);
  assert.equal(canUpdateAvatarFields({}, { avatarPath: path('profile-123.webp') }), true);
});

test('Storage coincide con Firestore para los nombres de foto y conserva los controles privados', () => {
  for (const [name, expected] of [['profile.webp', true], ['profile-123.webp', true], ['profile-no.webp', false], ['profile-123.png', false], ['profile-123Xwebp', false]]) {
    assert.equal(evaluate(`validAvatarName(${JSON.stringify(name)})`), expected, name);
  }
  assert.match(storage, /request\.auth\.uid == ownerUid/);
  assert.match(storage, /request\.resource\.size <= 300 \* 1024/);
  assert.match(storage, /request\.resource\.contentType == 'image\/webp'/);
  assert.match(storage, /request\.resource\.metadata\.studentId == studentId/);
  assert.match(storage, /allow read, write: if false/);
});
