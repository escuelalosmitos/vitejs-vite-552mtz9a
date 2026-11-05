# Ampliaciones con apertura futura — 3 de noviembre de 2026

## Archivos para publicar

Añade el nuevo archivo `src/components/classExpansionUtils.js`.
Sustituye `src/components/AdminPortal.jsx` y `src/components/StudentPortal.jsx`.
Publica los tres juntos. No hay dependencias nuevas, cambios de reglas de Firebase
ni de Apps Script. Después abre administración unos segundos para que publique
el catálogo actualizado y recarga el portal del alumno.

El ZIP parte de la versión anterior completa y conserva la corrección de correos
de profesores, los textos de cuatrimestre, la exclusión de Paco en BI y los filtros
del tablón.

## Qué se ofrece al alumno

En Ampliar clases se mantienen los grupos activos con plazas y se incluyen las
clases recurrentes todavía sin alumnos activos que estén ofertadas, tengan
profesor, plazas libres y una fecha de apertura válida no anterior a hoy.
Las clases con inicio automático aplazable siguen considerándose en formación
y no se ofrecen para ampliar.

La tarjeta indica Inicio y muestra la primera sesión semanal desde la apertura.
La selección muestra la incorporación solicitada. Enviar el trámite aún no
reserva la plaza: queda pendiente de aprobación administrativa.
Si cambia la fecha mientras el alumno tiene abierto el formulario, se pide
revisar el turno antes de enviar.

Las recuperaciones y cambios de horario conservan sus filtros: esta excepción
se aplica únicamente a Ampliar clases. Los campos añadidos al catálogo no hacen
que una clase futura pase a considerarse ocupación actual de Mitobox.

## Aprobación y asistencia

La solicitud guarda fecha y ruta de clase. Al ejecutarla individualmente,
administración confirma o modifica la fecha de incorporación. Se rechazan fechas
inválidas, anteriores a hoy o a la apertura, o que no coincidan con el día semanal.
El mantenimiento del alumno se comprueba en la fecha elegida.

Una transacción relee clase, solicitud y ficha del alumno y comprueba estado,
Tadosi preparado, aforo y condiciones de apertura. Reserva la plaza y completa
el trámite conjuntamente. Una solicitud ya ejecutada no duplica la plaza.
Si otro administrador ocupa la última plaza o cambia la apertura, se vuelve a
validar antes de escribir.

La fecha se guarda en la nueva matrícula, sin reemplazar la fecha de alta general
de la ficha ni las fechas de las otras clases. La plaza cuenta como comprometida
desde la aprobación, pero la asistencia la considera activa desde su incorporación.
No es necesaria una segunda consolidación para activarla al llegar ese día.

Las ampliaciones se ejecutan individualmente para confirmar la fecha. El cierre
en bloque las deja pendientes e informa de que necesitan esa confirmación.

## Correos y cuota

Las copias de solicitud incluyen la fecha solicitada. Los correos de confirmación
al alumno, al profesor y a gestión incluyen la fecha aprobada. El profesor recibe
la indicación de que el alumno no está activo antes de esa fecha.

Tadosi continúa siendo manual: no se ha creado una modificación automática de
recibos. El panel recuerda revisar la cuota desde la incorporación, especialmente
si se cambia la fecha propuesta. El mes objetivo y las proyecciones pendientes
utilizan la fecha de incorporación en lugar de la antigüedad del alumno.

## Verificación

`tests/class-expansion.test.mjs` prueba disponibilidad, fechas, publicación del
catálogo, separación de recuperaciones/cambios, solicitud real, aprobación real,
aforo o apertura cambiados, cancelación, duplicados y asistencia desde el inicio.
`package.json` añade esas pruebas al comando existente y no necesita sustituirse
para publicar los tres archivos indicados.
