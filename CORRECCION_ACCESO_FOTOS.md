# Acceso de alumnos con foto — 22/10/2026

Las reglas anteriores validaban avatarPath en cualquier actualización de la ficha, incluso cuando el inicio de sesión sólo guardaba claimed y authUid. Sólo admitían profile.webp, mientras que StudentPortal utiliza profile-<marca de tiempo>.webp. Una foto previamente guardada con ese nombre podía hacer que el inicio de sesión terminara en acceso denegado.

## Aplicar esta corrección

1. Copiar el contenido completo de firestore.rules en Firebase → Firestore Database → Reglas y pulsar Publicar.
2. Copiar el contenido completo de storage.rules en Firebase → Storage → Reglas y pulsar Publicar.
3. Cerrar sesión en la aplicación y volver a entrar con el usuario de prueba.

No es necesario sustituir ningún componente React para esta corrección. No hay que borrar la foto, la cuenta ni su vínculo con el alumno. El ZIP conserva además la corrección anterior de avisos y asistencia.

La ruta de la foto se valida sólo al añadirla o cambiarla. Se admiten tanto profile.webp como profile-<números>.webp, limitados a la carpeta del usuario autenticado y de su ficha. Storage admite ambos nombres y conserva el acceso privado, los controles de propietario, el tipo WebP, el límite de 300 KiB y los metadatos de propietario y alumno.

## Verificación

Se reproduce localmente el control que bloqueaba el inicio de sesión con foto y se comprueba que ahora permite actualizar claimed/authUid sin modificarla. También se prueban la foto antigua, la versionada, su eliminación y el rechazo de rutas de otro usuario, alumno, subcarpeta o tipo de archivo. Son cinco pruebas nuevas; pasan 65 pruebas locales en total.

Se añade una regresión de integración a tests/firestore-rules.test.mjs. Su ejecución con el motor real continúa pendiente: el emulador requiere Java 21 y este entorno tiene Java 17. Las pruebas locales evalúan las condiciones extraídas de las reglas y no sustituyen esa prueba. No se ha accedido a producción ni confirmado todavía el inicio de sesión real.
