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

test('administración mantiene sincronizadas las clases privadas de cada alumno', async () => {
  const admin = await read('src/components/AdminPortal.jsx');
  assert.match(admin, /classIdsByStudentId/);
  assert.match(admin, /expectedClassIds/);
  assert.match(admin, /classes: expectedClassIds/);
  assert.match(admin, /getClassStudentIds\(classData\.students \|\| \[\]\)/);
});

test('el portal del alumno no reinicia sus listeners por identidad del array de clases', async () => {
  const student = await read('src/components/StudentPortal.jsx');
  assert.match(student, /const profileClassIdsSignature =/);
  assert.match(student, /\[profile\?\.id, profileClassIdsSignature,/);
  assert.doesNotMatch(student, /\[profile\?\.id, profile\?\.classes,/);
  assert.match(student, /setClassesLoadError\('No se ha podido cargar el catálogo privado necesario/);
});

test('Firestore indexa la consulta privada de tickets del alumno', async () => {
  const indexConfig = JSON.parse(await read('firestore.indexes.json'));
  const ticketEmailOverride = indexConfig.fieldOverrides.find(field => (
    field.collectionGroup === 'tickets' && field.fieldPath === 'studentEmail'
  ));

  assert.ok(ticketEmailOverride);
  assert.ok(ticketEmailOverride.indexes.some(index => (
    index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
  )));
});

test('Firestore indexa la consulta optimizada de tickets del profesor', async () => {
  const teacher = await read('src/components/TeacherPortal.jsx');
  const indexConfig = JSON.parse(await read('firestore.indexes.json'));
  const ticketStudentIdOverride = indexConfig.fieldOverrides.find(field => (
    field.collectionGroup === 'tickets' && field.fieldPath === 'studentId'
  ));

  assert.match(teacher, /where\('studentId', 'in', studentIds\)/);
  assert.ok(ticketStudentIdOverride);
  assert.ok(ticketStudentIdOverride.indexes.some(index => (
    index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
  )));
});

test('Firestore indexa la localización de clases por alumno', async () => {
  const indexConfig = JSON.parse(await read('firestore.indexes.json'));
  const classStudentIdsOverride = indexConfig.fieldOverrides.find(field => (
    field.collectionGroup === 'recurringClasses' && field.fieldPath === 'studentIds'
  ));

  assert.ok(classStudentIdsOverride);
  assert.ok(classStudentIdsOverride.indexes.some(index => (
    index.arrayConfig === 'CONTAINS' && index.queryScope === 'COLLECTION_GROUP'
  )));
});

test('solo classAvailability declara lectura pública', async () => {
  const rules = await read('firestore.rules');
  const publicReads = rules.match(/allow read: if true;/g) || [];
  assert.equal(publicReads.length, 1);
  assert.match(rules, /match \/publicData\/classAvailability/);
  assert.match(rules, /match \/publicData\/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
});

test('Firebase solo despliega Firestore; Vercel aloja la aplicación', async () => {
  const config = JSON.parse(await read('firebase.json'));
  assert.ok(config.firestore);
  assert.equal('hosting' in config, false);
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
