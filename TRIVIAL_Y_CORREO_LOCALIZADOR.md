# Trivial diario y correos del Localizador

## Trivial: diagnóstico

El selector anterior calculaba el día del año dividiendo horas transcurridas desde enero entre 24. En horario de verano, el desfase de una hora permitía que el sábado 24/10/2026 a las 12:00 y el domingo 25/10/2026 a las 00:30, hora de Madrid, devolvieran el mismo día ordinal (297) y la misma pregunta. Se ha reproducido en las pruebas. Esto puede explicar la incidencia; no se dispone de la hora concreta a la que jugó la usuaria.

También se reiniciaba el selector cada enero. Con el banco actual de 364 entradas, el 31 de diciembre de un año no bisiesto y el 1 de enero siguiente podían coincidir. Dos preguntas del banco están duplicadas literalmente; se omiten al seleccionar, conservando el archivo original y un ciclo de 362 preguntas únicas por enunciado.

El reto era común para todos, pero el cálculo local y la hora podían desajustarlo. Ahora utiliza exclusivamente la fecha civil de Europe/Madrid y un contador continuo de días, sin reinicio anual. La pregunta cambia a las 00:00 de Madrid; el reloj se programa para esa medianoche y se actualiza al recuperar el foco o volver a una pestaña visible. Abrir el reto vuelve a comprobar la fecha real del dispositivo.

Se conserva la selección civil del 28/10/2026, fecha de transición. Desde ahí la secuencia recorre las 362 preguntas sin repetición de enunciado dentro del ciclo, con la misma pregunta para todos los alumnos que utilizan esta versión. El banco de preguntas no se modifica.

La pregunta queda fijada al abrir la partida. Si cambia el día, se cierra el intento antiguo y se puede abrir el del nuevo día; no se califica una respuesta contra una pregunta distinta. Los diez segundos se calculan con una fecha límite, de manera que dejar el navegador dormido no amplíe el tiempo.

Se conservan los puntos por dificultad (3/6/9), bonus rápido (+2), racha cada tres aciertos (+5) y puntos existentes. El guardado usa una transacción sobre el perfil actualizado: dos pestañas no suman el mismo reto dos veces. No se muestra un acierto como guardado si falla Firestore. Un fallo de conexión permite reintentar la misma respuesta, conservando su tiempo original, mientras siga siendo el mismo día.

## Correos del Localizador

Las alternativas impresas en la preparación y en el cuerpo del mensaje contienen solo **instrumento, día, hora, sede y cuota**. Se han retirado profesor, duración y plazas libres del texto. La validación interna sigue comprobando profesor, duración, cuota, aforo, fechas y disponibilidad antes de solicitar el envío.

La comparación de alumnos previa al envío ya no falla cuando cambian únicamente puntos del trivial, marcas de avisos leídos, foto o reclamación del perfil. Conserva las comprobaciones de datos que afectan a las plazas y al destinatario. Se ha probado el manejador real con cambios de puntos/lecturas durante la revisión y con cambios de horarios/profesor que deben seguir bloqueándolo.

El cliente utilizaba exclusivamente `contacto_localizador`, que necesita el complemento específico de Apps Script desplegado. Se ha cambiado a **`notificacion_email`**, el tipo general ya usado por otros correos, añadiendo `category: contacto_localizador` y el identificador de solicitud. El complemento actualizado reconoce tanto el formato anterior como el nuevo, mantiene Gestiones como remitente y conserva la deduplicación. Los demás tipos se delegan al código original.

La conexión existente usa `fetch` en modo `no-cors`: una solicitud completada no permite al cliente leer la respuesta del script ni acreditar entrega. Por eso el aviso sigue diciendo **envío solicitado**, no entregado. Se corrigen la ruta de solicitud y los bloqueos identificados; no se ha enviado un correo de prueba real ni se ha inspeccionado la implementación activa del servidor. Un fallo de alias, permisos, cuotas o una versión no publicada del script debe comprobarse en Apps Script/Enviados.

El complemento ya no presenta una solicitud de resultado incierto como enviada: registra `pending` antes de Gmail y `sent` solo después de que Gmail acepte la llamada. No reenvía automáticamente solicitudes pendientes para evitar duplicados.

## Archivos exactos de este bloque

Sustituir en GitHub:

- `src/components/StudentPortal.jsx`
- `src/components/AdminPortal.jsx`

Añadir en `src/components/`:

- `dailyTriviaUtils.js`
- `dailyTriviaStore.js`
- `useDailyTriviaDate.js`
- `locatorEmailUtils.js`

En Apps Script, actualizar el contenido del archivo **Localizador** con `instalacion-localizador/Localizador.gs` y publicar una nueva versión de la implementación existente. Subir ese `.gs` a GitHub no actualiza Apps Script.

Si el complemento ya estaba instalado, sustituir solo el archivo Localizador; no volver a renombrar funciones. Si no estaba instalado:

1. Guardar una copia del proyecto Apps Script actual.
2. Renombrar la función original `doPost(e)` a `doPostOriginal(e)`, manteniendo íntegro su contenido.
3. Crear el archivo Localizador y pegar `Localizador.gs`. Debe quedar un único `doPost` y un único `doPostOriginal`.
4. La cuenta ejecutora debe ser `gestiones@escuelalosmitos.com` o tener esa dirección autorizada como alias de envío.
5. En **Implementar → Gestionar implementaciones**, editar la implementación existente, seleccionar **Nueva versión** e implementar conservando su URL. Guardar el editor no publica la versión utilizada por la plataforma. `doGet` y Tadosi se conservan.

La ruta general permite compatibilidad con el manejador general anterior; actualizar el complemento es lo que aplica expresamente el remitente Gestiones y la deduplicación del Localizador.

No hay que cambiar reglas ni índices de Firestore: el trivial sigue actualizando los tres campos de perfil ya permitidos. No se añaden dependencias ni se reinician puntuaciones.

Se incluyen también las nuevas pruebas `tests/daily-trivia.test.mjs`, `tests/locator-email.test.mjs`, ampliaciones en `tests/locator.test.mjs`, el script de pruebas en `package.json`, esta guía y una nota en `instalacion-localizador/LEEME.md`.

## Validación

138 pruebas locales aprobadas y compilación correcta. Incluyen reproducción del fallo antiguo, zonas horarias distintas, cambios de hora, 5.000 transiciones de fecha, ciclo completo sin duplicados, cambio de año, medianoche con foco/pestaña suspendida, puntuación/rachas, concurrencia, guardado fallido y reintento, selección de campos del correo, comprobaciones de plazas y rutas de Apps Script con servicios aislados.

Los cuatro módulos nuevos pasan ESLint y no se añaden diagnósticos a los portales respecto a su versión anterior. Se conserva la advertencia previa de tamaño de bundle. Las pruebas de correo utilizan servicios simulados, no la cuenta real. Esta preparación no publica en GitHub, Vercel, Firebase ni Apps Script.
