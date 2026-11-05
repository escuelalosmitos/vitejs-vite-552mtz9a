# Contrato Mitobox y orden de Extras

Actualización sobre la versión 27 del paquete. Conserva las mejoras anteriores.

## Archivos para instalar

Añadir en GitHub:
- `src/components/mitoboxContractUtils.js`
- `src/components/MitoboxContractForm.jsx`

Sustituir juntos:
- `src/components/StudentPortal.jsx`
- `src/components/AdminPortal.jsx`

Publicar también `firestore.rules` en Firebase Console → Firestore Database → Reglas. El cambio exige contrato aceptado y fecha del servidor para las nuevas solicitudes de alta Mitobox enviadas por alumnos. No cambia Storage ni necesita índices nuevos.

El ZIP incluye las pruebas y `package.json` actualizado. No necesita modificar Apps Script.

## Presentación

En Extras aparecen primero Mitoverso y Mitobox, después Mitolocker compartido y exclusivo y después Gymusik. Las cabeceras de Mitolocker sitúan el icono junto al nombre; la modalidad aparece con tipografía menor.

## Solicitud de alta Mitobox

El botón abre el contrato completo. Se precargan el nombre principal de la ficha, la cuenta y la referencia de alumno. El nombre y los apellidos se pueden corregir sin modificar automáticamente la ficha. Si el usuario es menor, se identifica por separado al representante mayor de edad que acepta.

La aceptación es obligatoria y no viene marcada. Cambiar el nombre, la representación o la elección de inicio anticipado obliga a aceptar de nuevo. El botón indica la obligación de pago y la cuota. Se respeta la tarifa del contrato aportado: alumno con plaza de clases, 35 €/mes; externo sin plaza, 50 €/mes.

El formulario conserva las 25 cláusulas aportadas. Se adapta la identificación sin DNI, la tarifa aplicable y la fecha, y se concreta la información de desistimiento de la contratación a distancia. Las reservas y demás condiciones de uso mantienen su contenido.

Se guarda en la propia gestión:
- nombres del Contratante y del usuario y representación declarada;
- identificador de alumno, cuenta y UID de autenticación;
- texto exacto, versión y huella SHA-256;
- aceptación expresa y elección independiente sobre inicio anticipado;
- fecha declarada por el navegador y recepción registrada por el servidor.

La nueva regla comprueba que la cuenta y UID corresponden a la sesión, que hay aceptación y que la fecha es la del servidor. El alumno no puede modificar posteriormente ese contrato con los permisos de actualización de gestiones existentes. La huella identifica el texto; no es una firma certificada ni prueba por sí sola la identidad de la persona que utiliza la cuenta.

Se puede descargar el contrato antes de aceptar y la copia aceptada desde Extras, tanto con la solicitud pendiente como resuelta. El sistema solicita también el envío por el canal de correo existente. Ese canal usa `no-cors`: no debe confundirse una solicitud de envío con una entrega confirmada.

## Revisión administrativa

La bandeja muestra Contratante, usuario, representación, tarifa, versión e inicio solicitado, con descarga de la copia y su registro.

Al marcar «Tadosi hecho», se exige comprobar antes los nombres y, si corresponde, la representación en la documentación contractual y de facturación del Centro. Se registra qué administrador confirma esa comprobación y cuándo. No se consulta Tadosi automáticamente ni se copia el DNI al portal.

Antes de activar, se vuelve a leer la solicitud guardada y se comprueba la evidencia, la tarifa y la elección de inicio. La activación conserva referencia a la versión y huella del contrato y envía la copia en la confirmación existente.

Si no se pidió inicio durante los primeros 14 días, el alta no puede ejecutarse hasta que hayan transcurrido completos esos días naturales desde la recepción, calculados en Europe/Madrid. No se activa automáticamente al vencer el plazo: administración debe ejecutar la gestión. La solicitud de inicio anticipado es opcional y no equivale a una renuncia general al desistimiento.

Las solicitudes antiguas de Mitobox pendientes y sin contrato no se activan con este nuevo flujo: rechazar la solicitud antigua y pedir al alumno que envíe una nueva. Las suscripciones ya activas se conservan; este cambio no añade una aceptación retroactiva.

La cuota aceptada de nuevas altas se conserva en la ficha y se utiliza en BI. Los cambios de domiciliación, el paso posterior de tarifa de alumno a externo y los cobros siguen requiriendo gestión manual en Tadosi y la comunicación correspondiente.

## Alcance jurídico

Se refuerza el registro de aceptación y la comprobación de identidad; no se garantiza automáticamente la identidad ni la suficiencia de la representación. No es una firma electrónica cualificada ni una revisión jurídica integral del contrato.

El domicilio del prestador, confirmado por el titular, figura como **Carrer Assalt, 1 (Tarragona)**. La versión v2 añade este domicilio y conserva la posibilidad de verificar y descargar las aceptaciones v1 sin reescribirlas. No se ha añadido un DNI del cliente.

Referencias consultadas:
- LSSI, artículos 23, 24, 27 y 28: https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758
- Contratación a distancia y desistimiento: https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555
- Identificación sin copia sistemática del DNI: https://www.aepd.es/preguntas-frecuentes/1-tus-derechos/3-identificacion-con-dni/FAQ-0115-es-necesario-proporcionar-una-copia-del-dni-para-realizar-una-contratacion

## Validación

184 pruebas locales y compilación de producción correctas. Incluyen la entrada con el modal cerrado, identidad de adulto y representante, rechazo de aceptación ausente o alterada, tarifa de alumno y externo, revisión administrativa, inicio anticipado, plazo completo de desistimiento y orden de las tarjetas.

Se añade también una prueba de reglas para contrato obligatorio, fecha del servidor, cuenta y rechazo de cambios posteriores. No se ha podido ejecutar el emulador: Firebase exige Java 21 y el entorno dispone de Java 17. La nueva regla queda pendiente de esa comprobación específica antes de su publicación.

No se han enviado correos reales ni modificado la aplicación publicada o sus datos.

## Domicilio incorporado (versión 29 del paquete)

Carrer Assalt, 1 (Tarragona). El contrato nuevo usa versión v2. Las copias v1 ya aceptadas se conservan y siguen verificándose con su texto original. Si ya instalaste la versión 28, sustituye únicamente `src/components/mitoboxContractUtils.js` y publica de nuevo `firestore.rules` para que admita las nuevas aceptaciones v2.
