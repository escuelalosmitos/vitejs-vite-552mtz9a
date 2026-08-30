import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = path => readFile(path, 'utf8');

test('conserva los recursos visuales originales', async () => {
  await Promise.all([
    access('src/App.css'),
    access('src/assets/hero.png'),
    access('src/assets/react.svg'),
    access('src/assets/vite.svg'),
    access('public/favicon.svg'),
    access('public/icons.svg'),
    access('public/logo.png')
  ]);
});

test('el rol de profesor exige lista privada y no solo el dominio', async () => {
  const app = await read('src/App.jsx');
  assert.match(app, /staffAccess/);
  assert.match(app, /staffData\.role === 'teacher'/);
  assert.match(app, /setAccessRole\(isAuthorizedTeacher \? 'teacher' : 'denied'\)/);
});

test('el cierre de sesión restablece el estado y vuelve al acceso', async () => {
  const app = await read('src/App.jsx');
  assert.match(app, /const handleLogout = async/);
  assert.match(app, /setAccessRole\(null\)/);
  assert.match(app, /await signOut\(auth\)/);
  assert.match(app, /setUser\(null\)/);
});

test('el alumno usa proyecciones privadas en lugar de colecciones globales sensibles', async () => {
  const student = await read('src/components/StudentPortal.jsx');
  assert.match(student, /roleData', 'studentSettings/);
  assert.match(student, /roleData', 'studentClassCatalog/);
  assert.doesNotMatch(student, /collectionGroup\(db, 'recurringClasses'\)/);
  assert.doesNotMatch(student, /onSnapshot\(\s*collection\(db, 'artifacts', appId, 'temporaryClassChanges'\)/);
  assert.match(student, /where\('studentEmail', '==', studentEmail\)/);
  assert.match(student, /doc\(db, classPath\)/);
});

test('solo classAvailability declara lectura pública', async () => {
  const rules = await read('firestore.rules');
  const publicReads = rules.match(/allow read: if true;/g) || [];
  assert.equal(publicReads.length, 1);
  assert.match(rules, /match \/publicData\/classAvailability/);
  assert.match(rules, /match \/publicData\/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
});

test('Firebase se despliega sin Cloud Functions', async () => {
  const config = JSON.parse(await read('firebase.json'));
  assert.ok(config.firestore);
  assert.ok(config.hosting);
  assert.equal('functions' in config, false);
});

test('la prueba real usa solo el emulador y un proyecto ficticio', async () => {
  await Promise.all([
    access('tests/firestore-rules.test.mjs'),
    access('PRUEBA_SEGURIDAD_WINDOWS.md')
  ]);
  const packageConfig = JSON.parse(await read('package.json'));
  assert.match(packageConfig.scripts['test:rules'], /--only firestore/);
  assert.match(packageConfig.scripts['test:rules'], /--project demo-escuela-seguridad/);
  assert.doesNotMatch(packageConfig.scripts['test:rules'], /deploy/);
});
