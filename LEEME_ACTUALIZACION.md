# Paquete completo revisado — 4 de noviembre de 2026

Este ZIP sustituye al anterior y conserva todas sus funciones, incluido Mitolocker, el contrato de Mitobox y el control de aforo de recuperaciones. No es un parche parcial.

## Correcciones de esta revisión

1. **Tablón dirigido:** los alumnos pueden consultar la lista de avisos de los que son destinatarios. Se mantiene el rechazo a avisos de otros alumnos y a listados generales sin filtro. Los avisos generales y los filtros anteriores siguen funcionando.
2. **Asistencia y tickets:** la conciliación de un aviso archivado con asistencia confirmada anula el ticket no utilizado en una operación atómica. La comprobación de permisos consulta una sola vez la evidencia de asistencia y evita agotar el límite de expresiones de Firestore. Los tickets ya consumidos se conservan y generan una incidencia pendiente para administración; los regalos no se anulan por este proceso.
3. **Prueba musical:** ahora intenta cambiar el identificador por otro distinto en los siete formatos. Antes, al llegar al reto Compositor, enviaba el identificador que ya tenía y esperaba un rechazo que no correspondía.

El arreglo de recuperaciones permanece incluido: una solicitud pendiente retiene su plaza para una fecha concreta y su ticket; Admin y Profesor vuelven a comprobar el aforo al aprobar, sin duplicar alumnos aunque actúen a la vez.

## Resultado de la revisión

- 192 pruebas de aplicación y comportamiento: superadas.
- 36 comprobaciones de reglas y transacciones con Firestore emulado: superadas, incluyendo los tres casos anteriores, tickets duplicados o consumidos y reservas simultáneas del último hueco.
- `npm run test:security` completo: código de salida 0, con Node.js 24, Java 21 y Firestore Emulator 1.22.0.
- Compilación de producción: correcta.
- ZIP completo verificado para detectar archivos dañados y conservar los archivos anteriores.

No quedan pruebas fallidas de las baterías ejecutadas. La compilación conserva el aviso anterior sobre el tamaño de los paquetes JavaScript.

## Instalación

1. Descomprimir este ZIP en una carpeta nueva y comprobar que contiene `package.json`, `firestore.rules`, `src` y `tests`.
2. Usar Node.js 22.12 o posterior y JDK 21 o posterior para los comandos del proyecto. Se han corregido los requisitos antiguos en `PRUEBA_SEGURIDAD_WINDOWS.md`.
3. Instalar con `npm ci` y compilar con `npm run build`. Para la batería completa local, ejecutar `npm run test:security`.
4. Incorporar el código al proyecto de Vercel y publicar `firestore.rules` en el proyecto Firebase de la escuela siguiendo `DESPLIEGUE_SEGURO.md`. La aplicación se aloja en Vercel; no hay que publicar Firebase Hosting.
5. Abrir Admin y esperar a que termine de cargar y publique la disponibilidad de recuperaciones. Después, recargar Student y Profesor.

Este trabajo entrega código y reglas listos para desplegar. No ha modificado la base de datos ni el despliegue de producción. El usuario ha indicado que no se retome el caso histórico de una clase concreta; no hay una actuación retrospectiva pendiente por ese incidente.

## Archivos de esta revisión

- `firestore.rules`: consultas autorizadas del tablón y comprobación de anulación por asistencia.
- `tests/firestore-rules.test.mjs`: prueba musical corregida y comprobaciones adicionales del tablón y de tickets duplicados o consumidos.
- `PRUEBA_SEGURIDAD_WINDOWS.md`: requisitos de Node y Java actualizados.
- `RECUPERACIONES_AFORO.md`: resultado de validación actualizado.
- `LEEME_ACTUALIZACION.md`: este resumen e instalación.

El resto del contenido del ZIP anterior se conserva íntegro.


## Traspaso a Codex — 5 de noviembre de 2026

Esta entrega añade `AGENTS.md`, `CONTEXTO_PROYECTO.md`, `ABRIR_EN_CODEX.md`, un README del proyecto y referencias complementarias. Conserva sin cambios el código, las pruebas, las dependencias, los recursos de ejecución y las reglas de la revisión anterior. Empieza por `ABRIR_EN_CODEX.md`. La carpeta interna del ZIP se llama ahora `Escuela_Los_Mitos`.
