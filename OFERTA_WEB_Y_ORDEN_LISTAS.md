# Ampliar clases: oferta web y orden de las listas

Esta versión sustituye el criterio de ampliaciones de la versión anterior.

## Archivos que sustituir en GitHub

- `src/components/StudentPortal.jsx`
- `src/components/AdminPortal.jsx`
- `src/components/classExpansionUtils.js`

El archivo `src/components/publicEnrollmentUtils.js` ya forma parte de las versiones anteriores y se conserva sin cambios. Debe estar presente porque contiene el filtro compartido del formulario público.

También se actualiza `tests/class-expansion.test.mjs` para las comprobaciones locales.

No hay cambios en reglas de Firestore, Apps Script ni en el formulario de WordPress.

## Resultado

«Ampliar mis clases» consulta el mismo documento publicado que usa el formulario web (`publicData/classAvailability`) y aplica su misma lista blanca y filtro de plazas. Se incluyen clases ya abiertas, aperturas futuras y grupos en formación. Se excluyen las plazas fijas que el alumno ya tiene reservadas; no se resta otra plaza al aforo publicado.

Los turnos se vinculan a la clase interna por su identificador público estable, sin confundir grupos que comparten instrumento y horario. Si falta esa vinculación, el turno permanece visible como pendiente de actualización y no permite enviar una solicitud a una clase equivocada.

Tanto «Ampliar mis clases» como «Cambiar horario / pasar a grupo» se ordenan de lunes a domingo y por hora dentro de cada día. La segunda lista mantiene sus propios requisitos de cambio de plaza: este ajuste no la convierte en la lista de ampliaciones.

## Grupos en formación

Aprobar una ampliación en formación reserva la plaza con inicio pendiente. No cambia la fecha de alta de las clases que el alumno ya cursa ni activa la nueva asistencia o cuota. Al confirmar la apertura del grupo y el inicio del alumno desde la clase, se comunica la fecha y se crea una gestión pendiente para ajustar manualmente la cuota en Tadosi. La plataforma no modifica domiciliaciones por sí sola.

En las ampliaciones con fecha confirmada, administración sigue confirmando la incorporación y preparando el ajuste de cuota correspondiente.

La aprobación comprueba otra vez la oferta publicada y el aforo real dentro de una transacción para evitar ocupar una plaza agotada.

## Validación

Pruebas locales de selección, orden semanal y horario, identidad de grupos, fechas, reservas pendientes, aforo concurrente y confirmación de inicio, sin envío de correos reales ni cambios en producción. Se ejecuta también la batería estática del proyecto y la compilación de producción.
