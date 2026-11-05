# Tarjeta de vacaciones y reto musical: primera versión

## Reiniciar un reto desde la ficha del alumno

En Admin → Alumnos (CRM) → ficha del alumno → Retos musicales, cada intento dispone de **Reiniciar reto**. Al pulsarlo aparece una confirmación con la fecha del intento. Cancelar conserva todos los datos.

Confirmar vacía las respuestas, las puntuaciones y el tiempo/progreso de ese intento, lo devuelve a 0/36 y conserva el alumno, la fecha y la dificultad seleccionada. Puede reiniciarse tanto un intento en curso como uno terminado. No modifica puntos del Trivial, otros retos, asistencias ni tickets. Las marcas de lectura anteriores se eliminan y una nueva finalización vuelve a generar el aviso de CRM.

Cierra el reto del alumno antes de confirmar el reinicio y vuelve a abrirlo después. El plazo de acceso no se amplía: sólo podrá repetirlo mientras la tarjeta de esa fecha siga disponible. El reinicio aumenta la revisión del intento para rechazar guardados de pestañas antiguas. La operación es transaccional; si no se puede guardar, se informa del error y puede reintentarse.

Si ya instalaste la actualización de las 36 melodías y dificultad intercambiable, para añadir este botón basta con sustituir `src/components/VacationChallengeResults.jsx`. No cambia `firestore.rules`: sus permisos actuales ya permiten estas operaciones al administrador. En el ZIP se actualizan también `tests/vacation-card-render.test.mjs` y este documento.

## Actualización: 36 melodías y cambio de dificultad

El reto incorpora ahora 36 motivos melódicos originales diferentes, uno por actividad, con distintos ritmos. En una comparación, A y B comparten la melodía y el ritmo para que la diferencia corresponda a la propiedad preguntada. Los ejercicios de densidad mantienen el pulso y añaden notas entre sus golpes.

En Más desafío, las comparaciones de tempo usan diferencias aproximadas del 4–10 % según el bloque y la velocidad, con un mínimo de 3 BPM, frente al 25–35 % aproximado de Iniciación. También son más sutiles las aceleraciones y desaceleraciones. Estos ajustes son un punto de partida para el piloto y no una escala de dificultad validada con alumnos.

El alumno puede cambiar de nivel durante un intento en curso. El cambio se guarda y se aplica a las actividades sin responder. Si cambia el ejercicio pendiente, se borran su selección y las escuchas de ese ejercicio: debe escuchar los ejemplos del nivel nuevo antes de comprobar. Las respuestas anteriores conservan su dificultad, pregunta, primera respuesta y puntuación. Si cambia después de contestar, ese ejercicio y sus reintentos mantienen el nivel original; el nuevo nivel se aplica al avanzar.

Se mantiene el bloqueo de Comprobar respuesta hasta haber escuchado completos todos los fragmentos de la actividad. La pista conserva su funcionamiento anterior. El alumno no puede reiniciar un reto terminado; Admin puede hacerlo mediante la confirmación descrita arriba.

Los intentos antiguos se pueden retomar: las preguntas ya respondidas se interpretan con su contenido original y sólo las pendientes utilizan las nuevas melodías. No hay una modificación masiva de resultados anteriores. Admin muestra Dificultad mixta cuando corresponde y el nivel de cada respuesta.

Si ya instalaste la tarjeta anterior, sustituye únicamente estos archivos de aplicación, respetando las rutas:

- `src/components/tempoChallengeContent.js`
- `src/components/tempoChallengeAudio.js`
- `src/components/vacationChallengeUtils.js`
- `src/components/VacationChallengePlayer.jsx`
- `src/components/VacationChallengeResults.jsx`
- `firestore.rules`

Publica también el contenido actualizado de `firestore.rules` en Firebase → Firestore → Reglas. Es necesario para guardar la selección de dificultad y la versión del contenido. Después publica juntos los cinco módulos de la web y recarga la plataforma. `StudentPortal.jsx`, `AdminPortal.jsx`, `package.json`, las dependencias, el PDF y `storage.rules` no cambian respecto a la entrega anterior.

En el ZIP también se actualizan las tres pruebas de vacaciones y este documento. Las instrucciones siguientes describen la instalación completa desde una versión que todavía no incluía la tarjeta.

## Qué incluye

- La tarjeta de una clase que coincide con vacaciones mantiene su información de horario y muestra «Vacaciones», las cláusulas 3 y 9 del contrato, el artículo 22 del convenio y acceso al calendario completo.
- Dos desplegables, inicialmente cerrados: tareas y recursos del profesor, y reto musical con su explicación. No hay contador de vacaciones ni modo de previsualización.
- Las vacaciones son las fechas globales ya configuradas para ambas escuelas. Los festivos conservan su tratamiento por sede y no incorporan juego.
- El reto aparece cuando la próxima sesión del alumno coincide con una fecha de vacaciones. No se ofrece cada día a todos los alumnos. Por ejemplo, un alumno del jueves accede al reto de su jueves de vacaciones.
- La tarjeta de vacaciones se mantiene durante todo ese día, aunque haya pasado la hora habitual de clase. El reto cierra a las 23:59, hora de Madrid. Al terminar el día, la tarjeta pasa a la siguiente sesión que corresponda, que puede ser otra fecha de vacaciones.
- Se indica además la próxima clase presencial, saltando las vacaciones, festivos aplicables y fechas canceladas conocidas por la plataforma.

## El juego piloto

«Detective del tempo»: cuatro bloques, 36 actividades con melodías diferentes y dos niveles de dificultad intercambiables durante el intento. Trabaja pulso y tempo, intensidad y altura, cambios de velocidad y densidad de notas. Utiliza fragmentos originales sintetizados en el navegador; no necesita instrumento, micrófono ni archivos de audio externos.

Hay explicaciones, escuchas, opciones de respuesta, pistas, corrección y posibilidad de reintentar. El resumen distingue el primer resultado del resultado tras repasar. La duración es orientativa, alrededor de media hora; queda pendiente contrastarla con el uso real de alumnos.

El juego es el mismo en todas las vacaciones de este piloto. Se guarda un intento independiente por alumno y fecha; dos clases del mismo alumno en la misma fecha comparten intento. Se guarda al responder, avanzar y pausar, y puede retomarse dentro del plazo. Un intento terminado sólo puede reiniciarlo Admin, con confirmación. Las respuestas guardadas se conservan al caducar el acceso, salvo reinicio expreso por Admin.

No genera tickets de recuperación, puntos del Trivial ni calificaciones académicas. No cambia el flujo de asistencia o ausencias.

## Resultados en Admin

- Nueva pestaña «Retos musicales» en la ficha del alumno: intentos en curso o terminados, respuestas, aciertos iniciales, resultado tras repasar y uso de ayuda/reintentos.
- Al terminar un reto aparece aviso rojo en CRM, en el alumno y en la pestaña de resultados. Los intentos parciales no generan aviso.
- «Ver alumnos con retos nuevos» permite localizar a los alumnos pendientes de revisión.
- Abrir CRM o Resumen no consume el aviso: se marca como visto cuando se abre la pestaña de resultados y se han cargado del servidor. La lectura se guarda por administrador.
- El alumno accede a sus propios intentos. Los profesores no reciben acceso a esta nueva colección de resultados.

## Cómo instalar esta versión

1. Extraer el proyecto completo de `Escuela_Los_Mitos_Localizador.zip` y actualizar el código del proyecto como en las versiones anteriores. Este ZIP contiene también las correcciones previas; no es un parche aislado.
2. En Firebase → Firestore Database → Reglas, sustituir el contenido por el archivo `firestore.rules` incluido y pulsar **Publicar**. Si se publican desde la consola, no hace falta ejecutar el comando de despliegue de reglas. No modificar `storage.rules`: no ha cambiado en esta versión.
3. Publicar la nueva versión de la web mediante el procedimiento habitual. Deben incluirse los módulos nuevos y `public/docs/convenio-no-reglada.pdf`; copiar solo `StudentPortal.jsx` o `AdminPortal.jsx` no es suficiente.
4. Abrir o recargar Admin y esperar a que carguen sus ajustes. Admin publica automáticamente las fechas de vacaciones y sus límites de acceso, calculados con la hora de Madrid, en la configuración que ya leen los alumnos. Este paso es necesario antes del primer intento y también ocurre al actualizar las vacaciones desde Admin.
5. Recargar el portal del alumno. El juego aparecerá de forma natural cuando su próxima clase coincida con una fecha global de vacaciones ya configurada. No añadir festivos o vacaciones ficticias para activarlo.

No se han desplegado reglas ni web en producción ni se han modificado datos reales durante la preparación de este ZIP.

## Archivos de la entrega

Archivos de aplicación que se sustituyen:

- `src/components/StudentPortal.jsx`
- `src/components/AdminPortal.jsx`
- `firestore.rules`

Archivos de aplicación nuevos, todos necesarios:

- `src/components/VacationClassCard.jsx`
- `src/components/VacationChallengePlayer.jsx`
- `src/components/VacationChallengeResults.jsx`
- `src/components/vacationChallengeUtils.js`
- `src/components/vacationChallengeStore.js`
- `src/components/tempoChallengeContent.js`
- `src/components/tempoChallengeAudio.js`
- `public/docs/convenio-no-reglada.pdf`

Archivos de comprobación/documentación:

- `package.json` actualizado con las pruebas del piloto.
- `tests/firestore-rules.test.mjs` actualizado con escenarios de permisos del reto.
- `tests/vacation-challenges.test.mjs` y `tests/vacation-card-render.test.mjs`, nuevos.
- Este documento, `TARJETA_VACACIONES_PILOTO.md`.

No hay dependencias nuevas ni cambios en `package-lock.json`.

## Validación realizada

- 91 pruebas locales superadas: 78 mediante `npm run test:static` y otras 13 de localizador, bandeja y navegación CRM.
- Compilación de producción correcta mediante `npm run build`. Se mantiene el aviso de tamaño del paquete principal.
- ESLint sin errores ni advertencias en los cinco módulos modificados y las pruebas de contenido e interacción de esta actualización.
- Comprobados el renderizado real de la tarjeta, fechas con cambio de hora, permanencia de la tarjeta hasta medianoche, selección por día de clase, guardado transaccional, conflictos entre pestañas, audio y marcas de lectura.
- Las pruebas de interacción recorren las 36 actividades en ambos niveles mediante el JSX compilado y sus manejadores, con hooks y servicios aislados. Comprueban el bloqueo por escuchas, las pistas, el cambio de nivel, la conservación de respuestas, la reanudación y los errores de guardado. Las pruebas de audio verifican que suenen 36 secuencias diferentes y que las comparaciones sean coherentes con sus respuestas.
- El reinicio se comprueba con el manejador real aislado: vaciado de resultados, conservación del alumno y fecha, confirmación, errores, doble clic y rechazo de guardados obsoletos. Las marcas de lectura comprueban la revisión del intento para no consumir una nueva finalización después de un reinicio.
- Se han añadido pruebas de permisos, pero **no ha podido ejecutarse el emulador de Firestore**: la versión instalada de Firebase requiere Java 21 y este entorno dispone de Java 17. Ejecutar `npm run test:rules` en un entorno con Java 21 para comprobar esos escenarios contra el motor real.
- No se ha realizado una prueba interactiva completa en navegador ni una sesión cronometrada con alumnos. Las comprobaciones de renderizado y audio son automatizadas; la duración de media hora sigue siendo estimada.

Los resultados son orientativos para una actividad voluntaria, calculados en el cliente. No están diseñados para certificar una evaluación oficial.
