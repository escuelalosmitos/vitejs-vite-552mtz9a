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
  assert.match(admin, /classSubjectsByStudentId/);
  assert.match(admin, /expectedClassIds/);
  assert.match(admin, /expectedInstruments/);
  assert.match(admin, /classes: expectedClassIds/);
  assert.match(admin, /instruments: expectedInstruments/);
  assert.match(admin, /getClassStudentIds\(classData\.students \|\| \[\]\)/);
});

test('las recuperaciones quedan vinculadas al ticket y a su instrumento', async () => {
  const [student, admin, teacher] = await Promise.all([
    read('src/components/StudentPortal.jsx'),
    read('src/components/AdminPortal.jsx'),
    read('src/components/TeacherPortal.jsx')
  ]);

  assert.doesNotMatch(student, /profile\.instruments\s*&&\s*profile\.instruments\[0\]/);
  assert.match(student, /ticketId: isTicketRedemption \? selectedRecoveryTicket\.id/);
  assert.match(student, /ticketRefPath: isTicketRedemption \? selectedRecoveryTicket\.refPath/);
  assert.match(student, /requestedSubject: isTicketRedemption \? resolvedRecoverySubject/);
  assert.match(student, /ticketMatchesSubject\(selectedRecoveryTicket, selectedNewClass\.subject\)/);

  assert.match(admin, /matchedRecoveryTicket/);
  assert.match(admin, /ticketMatchesSubject\(matchedRecoveryTicket, targetClass\.subject\)/);
  assert.match(admin, /recoveryTicketRefPath/);
  assert.match(admin, /subjectScope: 'specific'/);

  assert.match(teacher, /recoveryTicketRefPath/);
  assert.match(teacher, /ticketMatchesSubject\(ticketToUse, currentSession\.subject\)/);
  assert.match(teacher, /usedInSubject: currentSession\.subject/);
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

test('Firestore indexa la consulta segura de tickets del profesor por correo autenticado', async () => {
  const teacher = await read('src/components/TeacherPortal.jsx');
  const indexConfig = JSON.parse(await read('firestore.indexes.json'));
  const teacherEmailFields = ['teacherEmails', 'recoveryTeacherEmails'];

  teacherEmailFields.forEach(fieldPath => {
    assert.match(teacher, new RegExp(`where\\('${fieldPath}', 'array-contains', teacherEmail\\)`));
    const override = indexConfig.fieldOverrides.find(field => (
      field.collectionGroup === 'tickets' && field.fieldPath === fieldPath
    ));
    assert.ok(override);
    assert.ok(override.indexes.some(index => (
      index.arrayConfig === 'CONTAINS' && index.queryScope === 'COLLECTION_GROUP'
    )));
  });
});

test('los accesos entre profesores exigen una relación operativa explícita', async () => {
  const [rules, admin, teacher, student] = await Promise.all([
    read('firestore.rules'),
    read('src/components/AdminPortal.jsx'),
    read('src/components/TeacherPortal.jsx'),
    read('src/components/StudentPortal.jsx')
  ]);

  assert.match(rules, /authorizedTeacherEmails/);
  assert.match(rules, /recoveryTeacherEmails/);
  assert.match(rules, /resource\.data\.originalTeacherUid != request\.auth\.uid/);
  assert.match(admin, /teacherSecurityAuthorization/);
  assert.match(admin, /teacherEmails/);
  assert.match(admin, /teacherSecurityAuthorizationVersion: 2/);
  assert.match(teacher, /where\('authorizedTeacherEmails', 'array-contains', teacherEmail\)/);
  assert.match(teacher, /where\('teacherEmails', 'array-contains', teacherEmail\)/);
  assert.match(student, /recoveryTeacherEmails: arrayUnion/);
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
