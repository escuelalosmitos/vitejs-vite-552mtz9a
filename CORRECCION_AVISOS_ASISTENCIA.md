# Corrección de avisos y asistencia — 22/10/2026

«Enterado» y el archivado cierran la gestión informativa. Ya no impiden que el guardado de asistencia actualice el resultado del aviso, ni vuelven a mostrar avisos cerrados en la lista de notificaciones pendientes.

Si finalmente consta «Asistió», el resultado es asistencia registrada sin ticket. Si se mantiene «Avisó», continúa el flujo automático de generación de tickets y sus condiciones actuales. Se actualizan todos los avisos coincidentes del mismo alumno, fecha y clase.

Al entrar el profesor se contrastan sus avisos antiguos sin resolver con sus asistencias guardadas. Sólo se corrige automáticamente la asistencia presente que se pueda identificar por el ID del alumno y la sesión; no se deduce por nombres, no se conceden tickets históricos y no se modifican otras fechas. La transacción relee los documentos para comprobar la asistencia vigente y el estado de los tickets. Conserva el archivado, anula un ticket relacionado sin consumir y crea una incidencia para administración si ya se había utilizado. La operación es idempotente.

Esta reparación necesita que la asistencia exista en Firestore en los registros del profesor. No reconstruye asistencias a partir de correos. No se ha ejecutado ninguna reparación contra producción durante la preparación de este paquete.

## Despliegue

Actualizar la aplicación y publicar las reglas Firestore incluidas con `firebase deploy --only firestore:rules`. Las reglas permiten al profesor anular un ticket propio sin consumir únicamente contra una prueba de asistencia del alumno, fecha y clase en un registro propio; no le permiten modificar la identidad, asignatura ni permisos del ticket. Los alumnos siguen sin acceso a las listas de asistencia.

## Tarjeta del alumno

El comportamiento no se cambia en este paquete: al superar la hora de inicio, el siguiente cálculo omite la sesión ya iniciada y muestra la siguiente disponible. No espera al fin de la clase. La pantalla dispone de una actualización de estado cada 60 segundos, además de los recálculos provocados por datos o interacción. Una clase de viernes a las 18:00 puede pasar a mostrar el viernes siguiente durante la propia clase.

## Validación

Compilación de producción correcta y 60 pruebas locales superadas, incluidas 13 de regresión de avisos, reparación y cambio de fecha de la tarjeta. Se incluye una prueba de integración adicional de Firestore para la reparación transaccional, permisos y anulación de tickets. Su ejecución en este entorno está bloqueada porque Firebase requiere Java 21 y sólo hay Java 17 disponible. Ejecutar `npm run test:rules` en un entorno con Java 21 antes de publicar las reglas.
