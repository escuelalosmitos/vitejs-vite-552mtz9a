# Localizador: Disponibles en formulario

Nueva pestaña en **Admin → Localizador de clases → Disponibles en formulario**.

Conserva el filtro existente **Ofertadas en web**. La nueva pestaña muestra únicamente los turnos que aparecen en el formulario de inscripción, con las plazas que ve el público. Se puede filtrar por escuela, instrumento y día.

## Fuente y coincidencia con el formulario

Se ha revisado el formulario adjunto `Texto pegado(20261027-104919).txt`, idéntico al `FORMULARIO_PUBLICO_WORDPRESS.html` incluido en el proyecto.

La vista escucha el mismo documento público `publicData/classAvailability`. No recalcula la disponibilidad con el número de alumnos activos del Localizador ni con la proyección del mes siguiente.

Reproduce la lista blanca y las condiciones del formulario: escuela, instrumento y horario informados; día entero de 0 a 6; aforo positivo; plazas publicadas mayores que cero. Incluye turnos en formación o con inicio futuro si el formulario los ofrece. Las reservas, mantenimientos y demás compromisos se reflejan en las plazas ya calculadas por el publicador existente.

También reproduce el avance automático de la fecha de inicio. Dos grupos con la misma escuela, instrumento y horario siguen apareciendo como dos turnos si el documento público los contiene.

Las tarjetas muestran horario, instrumento, escuela, aforo, plazas libres, precio, inicio, detalles y opción particular cuando están publicados. Los botones **Alumnos** y **Configurar / Web** enlazan con la clase interna mediante su identificador público estable. Un turno sin vinculación interna no se oculta: sigue apareciendo como en el formulario.

La nueva pestaña cambia a **Ahora** al seleccionarla. **Mes que viene** queda deshabilitado mientras se consulta; se habilita al elegir otra categoría. Una proyección futura no corresponde a lo que está publicado actualmente.

Se distinguen carga, falta de publicación, listado vacío y error de conexión. Los datos en caché se identifican mientras se espera confirmación del servidor. El listener se cierra al abandonar la vista; escucha un único documento. No realiza escrituras ni envía correos.

## Archivos exactos

Sustituir:

- `src/components/AdminPortal.jsx`

Añadir en `src/components/`:

- `PublicEnrollmentView.jsx`
- `publicEnrollmentUtils.js`

Se incluyen también `tests/public-enrollment.test.mjs`, una actualización de `package.json` para ejecutar estas pruebas y esta guía. Son recomendables para conservar las verificaciones, pero no son módulos importados por la interfaz.

No se modifican las reglas de Firestore ni el formulario de WordPress. Para este bloque no hay que volver a publicar reglas en Firebase.

Subir los tres archivos de interfaz juntos en una rama y pasarla completa a `main`, para que el componente nuevo esté disponible al publicar el Admin que lo importa.

El ZIP conserva el resto del proyecto, incluidos el catálogo de siete juegos y las mejoras anteriores del tablón.

## Comprobación

Cinco pruebas nuevas verifican la igualdad campo por campo con el código real del formulario, avance de fechas, grupos duplicados por horario, filtros cruzados, orden semanal, vínculo correcto con la clase, consulta de un único documento y estados de error/reintento. Las pruebas de componente ejecutan sus manejadores compilados con Firestore aislado.

En total: 123 pruebas locales aprobadas y compilación correcta. Los dos módulos nuevos pasan ESLint. Se conserva la advertencia previa de tamaño del bundle y los diagnósticos heredados de AdminPortal.

No se ha desplegado a producción ni consultado o modificado la base de datos real durante la preparación.
