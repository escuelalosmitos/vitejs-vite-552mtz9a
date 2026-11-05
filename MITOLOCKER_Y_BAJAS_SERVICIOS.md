> Documento de las versiones 26–27. Para instalar la versión actual, consulta `CONTRATO_MITOBOX_Y_ORDEN_EXTRAS.md`, que también incluye el cambio de reglas de Firestore.

# Mitolocker y bajas selectivas de servicios

Actualización sobre el paquete anterior, con todas sus mejoras conservadas.

## Archivos para publicar

Añadir:
- `src/components/fixedServicesUtils.js`

Sustituir juntos:
- `src/components/AdminPortal.jsx`
- `src/components/StudentPortal.jsx`
- `src/components/ServicesAdmin.jsx`

No hay cambios en Apps Script, en el formulario web ni en las reglas de Firebase. `src/App.jsx` y `firestore.rules` son idénticos a la versión anterior.

El ZIP incluye también las pruebas y la actualización de `package.json` para ejecutarlas; no son necesarios para copiar los cuatro archivos de la aplicación.

## Mitolocker

- Compartido: gratuito; el alumno autoriza el uso del instrumento por otros alumnos.
- Exclusivo: 5 €/mes; solo puede utilizarlo su propietario.
- Las modalidades son excluyentes y requieren una plaza de clases.
- El alumno solicita el alta desde Extras y administración revisa la gestión.
- El alta gratuita no requiere Tadosi. La de pago requiere preparar la domiciliación antes de activarla, como los demás servicios de pago.
- En la ficha se puede consultar y cambiar la modalidad. En Servicios hay una pestaña con altas, búsqueda y filtro por modalidad.
- No se permite contratar Mitolocker sin una plaza de clases ni crear una cuenta independiente de Mitolocker.

## Bajas

Si existen servicios activos, el formulario permite marcar las clases y los servicios que se desean cancelar. Sin servicios adicionales se conserva la opción de baja habitual.

Una solicitud solo de servicios llega como «Baja de servicios». La de clases con servicios asociados conserva el trámite de baja y muestra el alcance seleccionado. La solicitud no desactiva automáticamente los accesos: administración la revisa, prepara Tadosi cuando corresponde y confirma la fecha efectiva.

Mitolocker se cancela también al abandonar la última plaza, incluso si no se marcó su casilla. Se indica en el formulario y se comprueba nuevamente al aprobar y consolidar. Si queda otra plaza de clases, puede conservarse. La baja de todas las clases permite mantener Mitobox, Mitoverso y Gymusik si no se solicitó cancelarlos.

Los servicios se cancelan con la fecha efectiva de la baja y el circuito de consolidación de gestiones ya existente. La consolidación cancela las reservas de los servicios retirados, libera el aforo cuando corresponde y conserva los servicios restantes. Solo al quedar sin clases ni servicios independientes se desactiva la cuenta y se anulan tickets/puntuaciones siguiendo el flujo de baja existente.

La domiciliación y los cambios de cuotas en Tadosi siguen siendo manuales. Para Mitolocker, administración debe coordinar además la devolución del instrumento.

## BI

Recuentos separados de Mitolocker compartido y exclusivo. Solo el exclusivo suma 5 €/mes a los ingresos de Extras y al total. No se cuenta Mitolocker sin una plaza de clases; las previsiones respetan las bajas programadas y los servicios conservados. Los históricos de BI previamente guardados no se reescriben.

## Comprobación

- 171 pruebas locales: flujos de alumno y administración, bajas selectivas y automáticas de Mitolocker, ingresos/previsiones y regresiones anteriores.
- Compilación de producción comprobada.
- No se han enviado correos reales ni realizado cambios en la aplicación publicada.

Tras publicar, comprobar con una cuenta de prueba: alta compartida, alta exclusiva, cancelación solo de un servicio y baja de la última clase con Mitolocker.

## Corrección del arranque del panel del alumno

Se protege la consulta de servicios frente a `null`, que es el estado normal de la ventana de alta mientras está cerrada. Esto evita el error de `startsWith` que dejaba en blanco el panel. Para esta corrección solo hace falta sustituir `src/components/StudentPortal.jsx`. Se incluye una prueba que reproduce el fallo y comprueba tanto la ventana cerrada como las modalidades existentes.
