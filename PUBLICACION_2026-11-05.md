# Publicación de las correcciones y Mitoverso — 5 de noviembre de 2026

Publicación expresamente autorizada por Paco. No debe repetirse al leer este documento.

## Código y alojamiento

- Repositorio: https://github.com/escuelalosmitos/vitejs-vite-552mtz9a
- Rama de preparación: `codex/correcciones-auditoria-mitoverso-20261105`.
- Commit funcional publicado en `main`: `426b87cb547328bc007180578da46c15c0a18378`.
- Los cuatro proyectos conectados al repositorio desplegaron automáticamente y terminaron correctamente.
- Web de alumnos: https://alumnos.escuelalosmitos.com
- Proyecto Vercel: `vitejs-vite-552mtz9a-123k`, ID `prj_6tQVDzzzEeZQpVmzFxrtvrynup1M`.
- Despliegue funcional: `dpl_7p875mYZFM4bf9C6GSqRZt4hzGCd`, Production y Ready.
- El Preview fue Ready. Su protección impidió inspeccionar su contenido desde el conector; se verificaron después los archivos del dominio público sin alterar esa protección.

## Firebase

- Proyecto: `escuela-musica-app`.
- Se renovó la sesión CLI de `admin@escuelalosmitos.com` con autorización del usuario en Google. No se guardan credenciales en el repositorio.
- Se confirmó que las reglas anteriores coincidían con las aportadas por Paco y con la base auditada.
- Los índices administrativos de clases y correos de tickets ya estaban en versión 1.
- Preparación administrativa: se añadió únicamente `artifacts/default-app-id/roleData/studentSettings.mitoboxRoomCapacities`. Se derivó de la configuración vigente, con condiciones sobre las versiones de los documentos para no sobrescribir cambios concurrentes: Tarragona 10/8/4; Reus 8/5/4. No se alteraron los demás campos.
- No existían miembros Gymusik: no hubo saldos que migrar.
- Se ejecutó `firebase deploy --project escuela-musica-app --only firestore:rules --non-interactive` mediante la CLI incluida. Compilación y publicación correctas; permanecen avisos de función/argumento sin uso.
- Ruleset activo comprobado: `projects/escuela-musica-app/rulesets/d0085831-89f8-4121-980c-fd68a85c3f21`.
- SHA-256 del texto normalizado a LF: `2538cccb5bdfe35dd716a36211ca95a9ee9ed84824630582abb8bdfcaa9e3afa`.
- No se publicaron índices, Storage, Firebase Hosting, Functions ni Apps Script.

## Comprobaciones y límites

Antes de publicar: 221 pruebas de lógica/componentes, 48 pruebas de reglas/transacciones en emulador y compilación correcta. No se presenta el ESLint global como limpio.

Después de publicar, a las 14:55 CET:

- El dominio responde 200.
- `/assets/index-9_IyiPOj.js`, el módulo precargado y el CSS responden 200 y coinciden byte por byte con `dist` local.
- Las reglas activas coinciden con `firestore.rules` probado.
- La consulta anónima de `publicData/classAvailability` responde 200 con 48 clases. No contiene los campos de alumnos, correos y notas comprobados.
- Las consultas anónimas de configuración global, configuración de alumnos y miembros Gymusik responden 403.

No se iniciaron sesiones reales de los tres portales ni se realizaron reservas, avisos, bajas o solicitudes reales como prueba. No se enviaron correos ni se modificaron cobros/Tadosi. Las pruebas de operaciones permitidas y denegadas por rol se realizaron en emulador. Las pestañas anteriores a la publicación deben recargarse, porque no envían todos los metadatos exigidos por las reglas nuevas.

## Copias y reversión

Las copias operativas están solo en `.revision-deploy.local/` dentro de la carpeta local y no deben subirse: incluyen capturas de configuración privada. El directorio termina en `.local` y está excluido por `.gitignore`.

- Reglas anteriores: `firestore-production-before.rules`; referencia de release en `rules-release-before.json`.
- Ruleset anterior: `projects/escuela-musica-app/rulesets/8d7d3c87-955b-4cfa-9bed-a84b95042562`.
- Commit anterior de `main`: `e4636ec2e49ad8014ac4615dae9cf3ba4163787c`.
- Production anterior de la web de alumnos: `dpl_8Bh3p71pRG4TXWyb12XXRp8274hu`.
- Evidencia posterior local: `verification-result.json` y `firestore-production-after.rules`.

Si hay una regresión que obligue a revertir, restaurar frontend y reglas anteriores como una pareja. Conservar los documentos e historial; no borrar índices ni datos operativos. Este documento no autoriza una reversión automática.
