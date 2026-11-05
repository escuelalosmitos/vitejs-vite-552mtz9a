# BI y filtros del tablón — 2 de noviembre de 2026

## Archivo que debes sustituir

Sustituye únicamente `src/components/AdminPortal.jsx` en GitHub por el incluido en este ZIP.
El componente utiliza los módulos que ya estaban presentes en la versión anterior.
No hay cambios de reglas de Firebase, Apps Script ni dependencias.

## Coste empresarial evitado

El cálculo del mes actual excluye los registros cuyo profesor es Paco, igualando
el criterio del coste salarial de BI. La exclusión afecta al número de registros,
a las horas, al desglose por motivos y al importe; contempla mayúsculas, tildes
y espacios. Se conserva el resto del cálculo y el coste por hora configurado.

El mes actual se recalcula al cargar sus registros. La foto mensual de BI que se
guarda al abrir Informes incorpora ese resultado corregido. Las fotos históricas
de meses anteriores conservan los importes que se guardaron entonces y podrían
incluir horas de Paco; esta actualización no reescribe esos documentos.
La tarjeta en Histórico indica que muestra un importe guardado.

## Tablón

Debajo de Vigentes / Historial / Con novedades hay un segundo filtro:
Todos / Avisos / Encuestas / Convocatorias / Notificaciones breves.
Ambos filtros se cruzan. Los avisos antiguos sin un campo de tipo se consideran
avisos. Las notificaciones breves siguen siendo publicaciones de bandeja.
Cambiar de tipo vuelve a los primeros diez resultados y limpia la selección
anterior; no marca participaciones como leídas, archiva ni elimina publicaciones.
El contador de Con novedades sigue siendo el total del tablón.

## Archivos de verificación incluidos

`tests/admin-bi-board.test.mjs` comprueba la exclusión de Paco, el cómputo de otros
docentes y los quince cruces de tipo y vista. `package.json` únicamente incorpora
ese archivo al comando de pruebas; no es necesario sustituirlo para aplicar
estos dos cambios en producción.
