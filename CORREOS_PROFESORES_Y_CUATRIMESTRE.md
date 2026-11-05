# Correos de profesores y trivial — 3 de noviembre de 2026

## Archivos que debes sustituir

- `src/components/AdminPortal.jsx`
- `src/components/StudentPortal.jsx`

No hay módulos nuevos necesarios para publicar, ni cambios de dependencias,
reglas de Firebase o Apps Script. Conviene publicar ambos componentes juntos.
El ZIP conserva las mejoras anteriores, incluida la exclusión de Paco en BI
y los filtros por tipo del tablón.

## Activación

1. Tras publicar los componentes, abre administración y deja que cargue.
2. En Configuración, comprueba el correo corporativo exacto de cada profesor.
   Martí debe tener `martivg@escuelalosmitos.com`. Si lo cambias, guárdalo.
3. Mantén administración abierta unos segundos: publica automáticamente el mapa
   corporativo en la configuración reducida que consulta el alumnado.
4. Recarga el portal del alumno si lo tenías abierto con una versión anterior.

## Corrección de destinatarios

Las ausencias enviadas desde el portal del alumno usan el correo configurado;
se elimina la generación de direcciones a partir del nombre. El nombre admite
variaciones de mayúsculas, espacios y tildes. La dirección se conserva exactamente
salvo espacios exteriores y mayúsculas.

La gestión de ausencia y los destinatarios de gestiones y recuperaciones también
utilizan ese mapa. La publicación incluye únicamente nombres y direcciones
corporativas configuradas: no se copia el resto de la configuración privada.

Si falta una dirección, no es corporativa o hay direcciones contradictorias para
el mismo nombre normalizado, no se inventa un destinatario. La ausencia se guarda
y se informa de que no se pudo solicitar el correo. Un error de red tampoco
impide conservar el aviso.

La petición al Apps Script continúa usando `no-cors`; la respuesta del portal
indica que se ha solicitado el envío, sin asegurar una entrega que no puede
verificar. No se reenvían automáticamente los correos que rebotaron antes de
instalar la actualización.

## Trivial

En administración se muestran Cuatrimestre / Cuatrimestral en el botón de cierre,
tabla de clasificación, premio, confirmaciones y mensajes del trivial.
Las nuevas publicaciones de resultados también emplean Cuatrimestral.

Se mantienen los campos de datos y premios existentes, incluido el identificador
interno `trimestral`, para conservar puntuaciones y premios. El cierre sigue siendo
manual: este cambio de textos no reinicia puntos ni añade cierres automáticos.
Las evaluaciones docentes y sus periodos trimestrales no se modifican.

## Verificación

`tests/teacher-email-routing.test.mjs` prueba el destinatario real del aviso,
la ausencia sin correo o sin red, las gestiones y recuperaciones, la publicación
reducida de ajustes y la conservación de puntos y premios al cerrar el cuatrimestre.
`package.json` añade ese archivo al comando de pruebas y no necesita sustituirse
para aplicar los dos componentes en producción.
