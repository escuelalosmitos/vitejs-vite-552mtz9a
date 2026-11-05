# Tablón: destinatarios combinados, email breve e Historial

## Seleccionar destinatarios

En cualquiera de los cuatro tipos de publicación, el selector incorpora **Combinar filtros y días de la semana**. Abre cuatro grupos opcionales: Sede, Instrumento, Profesor y Día de la semana.

- Dentro de cada grupo se incluye cualquiera de los valores seleccionados. Lunes y miércoles significa alumnado que venga el lunes **o** el miércoles; no exige asistir ambos días.
- Los grupos distintos se cruzan. Guitarra + lunes y martes + Reus + Paco exige que una misma clase del alumno sea de guitarra, en Reus, con Paco, y se imparta el lunes o el martes.
- No basta con que un alumno tenga guitarra en Tarragona y otra clase de piano en Reus para cumplir Guitarra + Reus.
- Un grupo vacío no restringe. Debe elegirse al menos un criterio para publicar en este modo.
- Se utilizan las clases fijas activas y el horario vigente al guardar. Las recuperaciones, recolocaciones puntuales y las incorporaciones pendientes no añaden destinatarios.
- El formulario muestra la selección y los destinatarios estimados. Un alumno incluido por varias clases se cuenta una vez. Los emails se deduplican por dirección: una cuenta familiar recibe un solo correo.

Las publicaciones nuevas con filtros combinados guardan la lista de alumnos destinatarios al publicarse. El portal consulta estos documentos mediante el identificador de su alumno y las nuevas reglas de Firestore comprueban esa pertenencia. La lista no contiene correos. Los segmentos anteriores siguen siendo compatibles.

Se puede editar y recalcular la audiencia mientras no existan respuestas. En encuestas y convocatorias que ya tengan participaciones, los destinatarios quedan bloqueados: se conservan los filtros y la lista publicada. No se cambian las respuestas existentes.

## Email opcional de Notificación breve

La casilla **Enviar también por email a esos destinatarios** está disponible también en Notificación breve y desmarcada de forma predeterminada. La solicitud utiliza el mismo servicio de correo que ya usa el Tablón; no requiere cambiar Apps Script.

El correo se solicita después de guardar correctamente la publicación. Sin marcar la casilla no se solicita ningún envío. Si se edita y se vuelve a marcar, se solicita un nuevo envío.

El email se solicita **al guardar**, no mediante una tarea programada. Si la notificación breve tiene una fecha de publicación futura, su aparición en la bandeja se aplaza, pero el correo se solicita en ese momento de guardado. El formulario lo indica junto a la casilla. Esta versión no incorpora un programador de correos.

No se ha solicitado ni enviado ningún correo real durante la preparación de esta actualización: las pruebas emplean servicios simulados.

## Novedades de participación

- La bolita de Tablón mantiene su aviso general.
- Cada publicación con respuestas pendientes de consultar tiene además una bolita roja en su fila y en su título.
- **Con novedades** filtra directamente las publicaciones afectadas, incluidas las que ya estén en Historial.
- Entrar en Tablón o seleccionar una publicación no marca todas las respuestas como vistas. El aviso de esa publicación se consume al abrir Resultados o Candidaturas.
- Si una respuesta cambia mientras se está marcando como vista, la operación comprueba su versión temporal para no consumir esa novedad posterior.
- Los avisos antiguos que la versión previa ya marcó como vistos no se vuelven a convertir en novedades.

## Vigentes, Historial y archivo

La vista inicial es **Vigentes**. **Historial** conserva las publicaciones archivadas, las notificaciones breves caducadas y las encuestas o convocatorias cerradas. La clasificación se actualiza al abrir y periódicamente mientras está abierto Admin.

Antes, una notificación breve que alcanzaba su fecha de retirada dejaba de mostrarse en la bandeja del alumno, pero permanecía en la lista principal de Admin. Ahora pasa a Historial automáticamente en la interfaz y conserva sus datos.

Los cuatro tipos tienen opción de archivar y restaurar. Archivar retira la publicación del alumnado y conserva contenido y participaciones. En Notificación breve también se actualizan las copias de las bandejas privadas. Restaurar no amplía las fechas: una notificación caducada seguirá en Historial y habrá que editar su retirada para volver a mostrarla.

La fecha «Fijada hasta» de un aviso sólo controla cuánto tiempo está fijado; no es una fecha de retirada del aviso. Para retirarlo se utiliza Archivar.

Se mantiene el borrado con confirmación que ya existía. Las encuestas y convocatorias con participaciones conservan su protección contra borrado y ofrecen archivo. El archivo es la opción habitual para mantener limpio el panel sin perder información. Archivar no retira emails que ya hayan sido enviados.

## Archivos e instalación

El ZIP completo mantiene las mejoras anteriores de Admin, alumnos y retos musicales. Para instalar sólo esta actualización:

1. Añadir estos dos archivos nuevos a `src/components/`:
   - `announcementAudienceUtils.js`
   - `AnnouncementAudienceFilters.jsx`
2. Sustituir los tres portales:
   - `src/components/AdminPortal.jsx`
   - `src/components/StudentPortal.jsx`
   - `src/components/TeacherPortal.jsx`
3. Sustituir `firestore.rules` en el proyecto y publicar su contenido en **Firebase → Firestore Database → Reglas → Publicar**. Subirlo a GitHub no publica las reglas por sí solo.
4. Publicar los módulos de la web juntos y recargar los portales. Las reglas se deben publicar antes de utilizar los filtros nuevos.

El ZIP también actualiza `package.json`, `tests/firestore-rules.test.mjs` y añade `tests/announcement-audience.test.mjs` y esta guía. No incorpora dependencias nuevas ni modifica `package-lock.json`, `storage.rules` o los índices compuestos.

No se ha desplegado la web, publicado reglas ni modificado datos de producción.

## Validación

- 106 pruebas locales superadas: 93 mediante `npm run test:static` y 13 de localizador, bandeja y navegación CRM.
- Compilación de producción correcta; permanece el aviso previo del tamaño del paquete principal.
- Módulos nuevos y pruebas nuevas sin errores de ESLint. Los portales mantienen los diagnósticos heredados; se han comparado con la entrega anterior para detectar regresiones.
- Se comprueban los cruces sobre una misma clase, las alternativas de días, los filtros vacíos, la deduplicación por alumno y email, la audiencia bloqueada al haber respuestas, las solicitudes opcionales de correo, el archivo/restauración de copias privadas y los avisos de cada publicación.
- El panel de filtros se renderiza en una prueba automatizada. Los manejadores reales de los portales se prueban de forma aislada, con Firebase y el servicio de correo simulados. No se ha realizado una revisión interactiva en un navegador completo.
- Se han añadido escenarios para comprobar que un alumno sólo puede consultar los segmentos nuevos que lo incluyen. **El emulador de Firestore no ha podido arrancar**: Firebase CLI requiere Java 21 y este entorno tiene Java 17. `npm run test:rules` debe ejecutarse en un entorno con Java 21 para validar esos escenarios contra el motor real.
