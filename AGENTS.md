# Escuela Los Mitos — instrucciones para Codex

## Contexto de entrada

Este es un proyecto existente de gestión de una escuela de música, no una plantilla para comenzar de cero. El interlocutor es Paco Mitos, titular de Escuela Los Mitos, con sedes en Tarragona y Reus. Responde en español, con explicaciones claras y concretas.

Lee `CONTEXTO_PROYECTO.md` para orientarte y la documentación del módulo que vayas a modificar. `ABRIR_EN_CODEX.md` explica el arranque en Windows. Los documentos antiguos describen versiones anteriores: el código actual, la solicitud actual del usuario y el resumen de traspaso tienen prioridad para interpretar el estado actual.

## Decisiones que debes conservar

- Separa las plazas fijas de matrícula y la ocupación de una sesión por fecha. Las recuperaciones y sus solicitudes pendientes NO reducen la oferta web de plazas fijas. Sí consumen aforo de recuperación en su fecha concreta.
- Mantén las transacciones de reserva, aprobación y liberación de recuperaciones. No sustituyas la relectura de Firestore por una comprobación únicamente visual o por una copia antigua del estado de React.
- Mitolocker requiere una plaza principal de clases. Compartido: gratis; exclusivo: 5 €/mes. Al perder la última plaza se cancela Mitolocker. Mitobox, Mitoverso y Gymusik pueden mantenerse de forma independiente cuando corresponda.
- Las bajas selectivas solo cancelan lo solicitado, salvo la dependencia automática de Mitolocker. No confundas baja de un servicio con baja completa de la escuela.
- La aceptación del contrato de Mitobox es obligatoria antes de enviar la solicitud. Conserva el texto aceptado, su huella y sus versiones históricas; no reescribas contratos ya aceptados. La comprobación de identidad en Tadosi es manual.
- Identifica alumnos por su ID y clases por su ruta canónica cuando exista. El titular del correo puede ser un familiar; el nombre o correo no sustituyen al ID del alumno. Puede haber clases con IDs o nombres coincidentes en distintas rutas.
- No publiques datos de alumnos, notas ni correos en `publicData/classAvailability` ni en los calendarios anónimos de aforo.
- No hay una tarea pendiente de modificar retrospectivamente una clase concreta por el incidente histórico de aforo. La prioridad acordada es prevenir nuevas sobreocupaciones.

## Forma de trabajar

- Conserva las mejoras existentes y realiza cambios acotados al encargo. Los portales grandes contienen numerosos circuitos que no deben desaparecer al resolver un problema localizado.
- Revisa los cambios locales antes de editar; no sobrescribas trabajo del usuario. Mantén los recursos y la documentación existentes.
- La configuración del frontend apunta al Firebase real y algunos `fetch` de Apps Script pueden enviar correos. Un servidor Vite local no convierte esos servicios en un entorno de pruebas. Usa emuladores o dobles para verificar; no envíes mensajes ni alteres producción como prueba.
- Distingue código preparado, pruebas realizadas y despliegue confirmado. Este paquete no acredita qué versión haya publicado el usuario en Vercel o Firebase.
- Las modificaciones de permisos se comprueban con operaciones permitidas y denegadas, sin abrir colecciones completas para resolver una consulta concreta.
- Actualiza `CONTEXTO_PROYECTO.md` cuando cambien decisiones, arquitectura, estado de publicación o pendientes relevantes.

## Entorno y comprobaciones

- Node.js 22.12 o posterior y JDK 21 o posterior para la CLI Firebase incluida. Usa `npm ci` si faltan dependencias; respeta `package-lock.json`.
- Desarrollo: `npm run dev`. Compilación: `npm run build`.
- Pruebas locales de lógica y componentes: `npm run test:static`.
- Reglas reales en emulador: `npm run test:rules`. Proyecto ficticio: `demo-escuela-seguridad`.
- Batería completa: `npm run test:security`.
- Ejecuta las comprobaciones apropiadas al cambio. No presentes una compilación correcta como prueba suficiente de los permisos de Firestore.
- Existe `npm run lint`, pero el traspaso no certifica un ESLint global sin diagnósticos heredados. Contrasta cualquier fallo con la base antes de atribuirlo a un cambio nuevo.

## Despliegue

La aplicación se aloja en Vercel; Firebase proporciona Auth, Firestore y Storage. Sigue `DESPLIEGUE_SEGURO.md` para publicar dentro del alcance autorizado por el usuario. No sustituyas el alojamiento por Firebase Hosting ni des por publicada una regla por haber editado su archivo local.
