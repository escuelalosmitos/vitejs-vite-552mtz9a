# Retos musicales: catálogo personal y panel de pruebas

## Qué incluye esta versión

Siete juegos disponibles: Detective del tempo (36 actividades), El eco perdido (32), Laboratorio de ritmos (24), El laberinto melódico (32), El mapa de la canción (24), El mezclador secreto (32) y Misión compositor (16 misiones de construcción). La duración es orientativa, aproximadamente media hora según escuchas, reintentos y ritmo personal; no hay un temporizador que obligue a permanecer ese tiempo.

Los juegos ofrecen Iniciación y Más desafío, explicaciones, pistas, escucha completa obligatoria antes de comprobar y reintentos. Laboratorio de ritmos y El mapa de la canción permiten construir y escuchar la solución propuesta. Misión compositor admite muchas soluciones y comprueba objetivos explícitos de estructura, sin juzgar el gusto musical. En composición hay que escuchar la propia construcción antes de comprobarla.

Cada alumno sigue un recorrido personal. Al pulsar **Empezar mi reto**, se asigna el siguiente juego y se guarda su posición de forma atómica con la partida. Abrir la tarjeta o la pantalla inicial no consume juegos. Retomar esa fecha conserva juego, ejercicios y progreso. En una nueva fecha de vacaciones recibe el siguiente, aunque el anterior quedara incompleto. Después del séptimo vuelve al primero con otra semilla. No se reinicia al cambiar de año. Varias clases en la misma fecha comparten intento.

El acceso sigue condicionado por la tarjeta de una clase afectada por vacaciones generales y termina a las 23:59 de esa fecha, hora Europe/Madrid. Los festivos globales o locales no generan retos. No se concede puntuación del Trivial ni tickets de recuperación.

## Configuración → Retos musicales

- Elegir cualquier juego y nivel, sin depender de las vacaciones.
- **Probar desde el principio**: partida nueva con los ejercicios de la variante seleccionada.
- **Generar otra variante y probar**: otra combinación de contenido.
- Las pruebas se mantienen solamente en memoria mientras está abierta la ventana. Cerrar termina la prueba; no se guarda en Firebase ni produce novedades en CRM.
- Ordenar los siete juegos con las flechas y pulsar **Guardar orden**. El orden se publica a alumnos junto con su configuración; las partidas iniciadas conservan su identidad.
- Si se cambia el orden, el siguiente juego será el que siga al último iniciado por cada alumno dentro del nuevo orden.
- Recuento por año y día de la semana usando exclusivamente las fechas de vacaciones del calendario. Es un recuento general, no una predicción individual.

## CRM → Alumnos → Retos musicales

Conserva los resultados antiguos y muestra los nuevos formatos y construcciones. Incluye próximo juego, respuestas iniciales y finales, dificultad de cada actividad, ayudas, estado y reinicio individual. En composiciones se muestran los objetivos del encargo.

Reiniciar conserva juego, semilla, dificultad, fecha y posición de secuencia; vacía respuestas/puntuación de ese intento y aumenta su revisión. No avanza ni rebobina el recorrido. Cerrar y reabrir el juego en el alumno después del reinicio. Se mantiene el plazo original.

Las novedades se generan al completar el intento y se marcan leídas cuando se consulta la pestaña de resultados, como antes. Los incompletos quedan consultables sin generar un aviso de finalización.

## Compatibilidad y almacenamiento

Las partidas anteriores de Detective del tempo conservan sus generadores y reproductor originales. Al empezar una fecha nueva, el historial antiguo se consulta si aún no existe la nueva secuencia; se continúa después del último juego iniciado. No se borran ni reescriben esos resultados.

Las partidas nuevas utilizan contentVersion 3, generatorVersion 1 y una semilla guardada. Misma semilla, versión y dificultad producen los mismos ejercicios; cada respuesta guarda su dificultad, de modo que cambiar de nivel no cambia preguntas ya contestadas. Los generadores anteriores deben conservarse al incorporar futuras versiones.

Los fragmentos se sintetizan en el dispositivo, sin grabaciones, micrófono, IA ni servicios de generación externos. El contenido tiene reglas musicales y variaciones controladas; pueden repetirse motivos breves por casualidad. Los juegos se cargan al abrirlos. No se añaden dependencias.

Firestore guarda una secuencia pequeña por alumno en `studentMusicProgress/{studentId}` y una partida por alumno/fecha en `vacationChallengeAttempts`. Empezar implica dos escrituras atómicas. Responder, reintentar, avanzar, cambiar nivel y cerrar una partida en curso guardan progreso mediante transacciones. Escuchar, cambiar una casilla o pedir una pista no escribe por sí solo. No hay guardado por segundo. La primera inicialización de secuencia consulta el historial del alumno; las siguientes no vuelven a enumerarlo.

Las reglas limitan la secuencia y las partidas a su propio alumno; el profesorado no recibe acceso a estos resultados. Administración conserva acceso. Identidad, semilla y versión de una partida no pueden cambiarse al guardar progreso desde el alumno. Los resultados son autoevaluativos, no una certificación ni una evaluación con garantías contra manipulación de un cliente modificado.

## Archivos exactos para instalar este bloque

Sustituir:

1. `src/components/AdminPortal.jsx`
2. `src/components/VacationClassCard.jsx`
3. `src/components/VacationChallengeResults.jsx`
4. `firestore.rules` (raíz del proyecto)

Añadir, todos dentro de `src/components/`:

5. `musicChallengeCatalog.js`
6. `musicChallengeContent.js`
7. `musicChallengeAudio.js`
8. `musicChallengeStore.js`
9. `MusicChallengePlayer.jsx`
10. `VacationChallengeLauncher.jsx`
11. `VacationChallengesAdmin.jsx`

También se incluyen actualizaciones de `package.json`, `tests/firestore-rules.test.mjs`, `tests/vacation-card-render.test.mjs`, el nuevo `tests/music-challenges.test.mjs` y esta guía. Recomendado incorporarlos para conservar las verificaciones; no son módulos importados por los portales en ejecución.

Se mantiene el resto del proyecto completo, incluidos los cambios anteriores del tablón y su filtrado.

## Instalación desde GitHub web y Firebase

1. En Firebase, seleccionar el proyecto correcto → Firestore Database → Reglas. Sustituir el contenido por `firestore.rules` de esta entrega y pulsar **Publicar**. Estas reglas conservan los intentos antiguos y añaden el catálogo nuevo. Subir el archivo a GitHub por sí solo no publica reglas en Firebase.
2. En GitHub, trabajar en una rama distinta de `main`.
3. Añadir los siete módulos nuevos en `src/components/` y sustituir los tres componentes existentes indicados. Incorporar también el archivo de reglas de la raíz y los archivos de pruebas/guía si se desea conservar todo el proyecto.
4. Pasar la rama completa a `main` mediante una pull request cuando estén todos los archivos. Así el despliegue de Vercel no recibe componentes que importan módulos todavía ausentes.
5. Cuando termine el despliegue, abrir Admin → Configuración → Retos musicales. Probar los juegos y guardar el orden deseado. El orden por defecto ya es válido.
6. Para comprobar el acceso real de un alumno se necesita una de sus tarjetas de vacaciones disponible. El modo de prueba de Admin permite revisar los juegos fuera de esas fechas sin modificar el calendario.

No se han publicado cambios en producción ni enviado correos desde esta preparación.

## Validación y límites

Se comprueba generación determinista para múltiples semillas de los siete juegos en ambos niveles, coherencia de respuestas/audio, soluciones de construcción, dificultad mixta, compatibilidad antigua, ciclo personal, migración, carreras de dos pestañas, errores de guardado y reinicios. Se recorren los manejadores reales del reproductor compilado hasta completar los siete juegos en ambos niveles; las pruebas del administrador no llaman a persistencia.

Las pruebas de componentes utilizan audio y servicios aislados; no sustituyen una escucha humana en distintos móviles/navegadores. La duración y adecuación pedagógica deben contrastarse con el uso real.

La compilación funciona y las pruebas locales pasan. Se han añadido escenarios del catálogo a las pruebas reales de Firestore, pero aquí no se pueden ejecutar: Firebase CLI requiere Java 21 y el entorno dispone de Java 17. Por tanto, las reglas se entregan revisadas, sin afirmar una validación completa del emulador. El proyecto conserva advertencias previas de tamaño de bundle y diagnósticos heredados de AdminPortal.
