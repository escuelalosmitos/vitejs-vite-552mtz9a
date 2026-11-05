# Recuperaciones: aforo por sesión

Esta actualización corrige las solicitudes de recuperación que podían superar la capacidad de una clase.

## Comportamiento

- El selector de Student consulta plazas para cada fecha: alumnos fijos operativos, recuperaciones de ese día y solicitudes pendientes. Una recuperación de otra semana no consume plaza en esta sesión.
- Enviar una solicitud retiene una plaza y vincula su ticket de forma exclusiva. Si dos alumnos solicitan el último hueco a la vez, solo uno puede reservarlo.
- Admin y Profesor aprueban mediante el mismo control transaccional: releen la plantilla guardada, el ticket y las reservas. La aprobación incorpora al alumno, completa la gestión y transforma la retención en plaza confirmada en una sola operación.
- Rechazar libera plaza y ticket. Cancelar una recuperación aprobada retira solo esa recuperación, conservando las de otras fechas.
- Las solicitudes antiguas pendientes se incorporan al calendario al sincronizar Admin. No se cancelan automáticamente recuperaciones ya aceptadas.
- Los avisos de ausencia por sí solos no liberan una plaza fija para vender una recuperación.

## Activación

1. Desplegar el archivo actualizado `firestore.rules` en el proyecto Firebase de la escuela con el procedimiento habitual. Las nuevas colecciones están cerradas salvo los permisos expresos incluidos en esas reglas.
2. Compilar y desplegar la aplicación actualizada (`npm run build`).
3. Abrir Admin y esperar a que terminen de cargar sus datos: publica automáticamente la disponibilidad para los próximos 120 días. Sin calendario publicado, Student bloquea las solicitudes e indica que falta la sincronización.
4. Recargar las sesiones de Student y Profesor para que usen el código nuevo.
5. Verificar el circuito con datos de prueba: una recuperación pendiente o aprobada cierra el aforo de su fecha sin reducir la oferta web de plazas fijas. El usuario ha descartado retomar el caso histórico concreto; no hay una corrección retrospectiva pendiente.

La publicación se actualiza al abrir Admin y cuando cambian sus datos. Las aprobaciones siempre vuelven a comprobar la plantilla guardada. Las modificaciones manuales de matrículas o plantillas siguen sus procedimientos existentes; deben respetar las recuperaciones ya comprometidas para esa fecha.

## Archivos funcionales

- `src/components/StudentPortal.jsx`
- `src/components/AdminPortal.jsx`
- `src/components/TeacherPortal.jsx`
- `src/components/recoveryCapacityUtils.js` (nuevo)
- `src/components/recoveryCapacityStore.js` (nuevo)
- `firestore.rules`

Se actualizan los scripts de pruebas y se añaden pruebas de ocupación, integración del selector y concurrencia real con las reglas de Firestore.

## Validación

- 192 pruebas estáticas y de comportamiento: correctas.
- 12 casos de recuperación con Firestore emulado (13 comprobaciones contando el grupo): correctos, incluyendo competencia por la última plaza, doble aprobación Admin/Profesor, exclusividad del ticket, rechazo, cancelación y datos desactualizados.
- Compilación de producción: correcta. Permanece el aviso previo de tamaño de los paquetes JavaScript.
- Revisión completada: la batería completa de reglas pasa sus 36 comprobaciones. Se han corregido la consulta del tablón dirigido y la anulación de tickets con asistencia confirmada. También se ha ajustado la prueba musical que enviaba un identificador idéntico al original y provocaba un falso positivo.

La validación completa `npm run test:security` terminó con código 0 usando Node.js 24, Java 21 y el emulador oficial de Firestore 1.22.0. Incluye las 192 pruebas de aplicación y las 36 comprobaciones de reglas, sin fallos.
