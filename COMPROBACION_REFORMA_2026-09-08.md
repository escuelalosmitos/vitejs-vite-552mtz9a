# Reforma de alumnos, talleres y plantilla docente

## Cambios incluidos

- El acceso del alumno prioriza la ficha vinculada a su usuario y, si existe una referencia antigua, selecciona la ficha activa con clases actuales y repara el vínculo interno.
- Al reactivar a un alumno se eliminan las fechas y marcas antiguas de baja que podían bloquear una reincorporación.
- Los mantenimientos vencidos dejan de bloquear al alumno por fecha. Al entrar en Administración también se limpian las marcas antiguas asociadas.
- Al pasar un alumno a `Impago`, su acceso queda bloqueado y se envía automáticamente el aviso de pago al correo de su ficha.
- Desde Alumnos CRM se puede ejecutar una baja inmediata y definitiva para alumnos sin plaza, en impago o en mantenimiento. La operación prevalece sobre estados y gestiones anteriores.
- Un taller cancelado desaparece del portal del alumno y cancela sus inscripciones activas.
- El alumno puede cancelar su inscripción a un taller hasta el comienzo de su primera sesión.
- Un taller cancelado se puede eliminar definitivamente, junto con sus inscripciones asociadas.
- La plantilla docente guarda el nombre normalizado y el correo corporativo exacto de cada profesor. Ese correo alimenta los permisos internos y los distintos apartados de Administración.

## Comprobación recomendada tras desplegar

1. Entrar con un alumno que se dio de baja y volvió. Debe ver su clase actual y no una referencia histórica.
2. Entrar con un alumno cuyo mantenimiento ya haya terminado. Debe recuperar el acceso y aparecer activo.
3. Pasar una cuenta de prueba a `Impago`. Debe recibir el correo y ver el bloqueo del Área del Alumno.
4. Reactivar esa cuenta. Debe recuperar el acceso sin conservar marcas de baja o mantenimiento.
5. Probar la baja inmediata sobre una cuenta sin plaza o en impago y confirmar que desaparecen sus clases, talleres y trámites pendientes.
6. Inscribir una cuenta de prueba en un taller y cancelarla desde Extras. La plaza debe liberarse.
7. Cancelar un taller desde Administración. Debe desaparecer de Extras; después debe poder eliminarse definitivamente.
8. Añadir un profesor con su correo `@escuelalosmitos.com` y comprobar que aparece al crear una clase y en la plantilla docente. Para iniciar sesión, ese mismo correo debe existir también en Firebase Authentication.

## Verificaciones técnicas realizadas

- `npm run test:static`: 18 pruebas superadas.
- `npm run build`: compilación de producción superada.
- No se han modificado las reglas de Firestore en esta reforma.

