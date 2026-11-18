# Promociones de inscripción

En Administración → Configuración → Promociones se pueden preparar, programar y pausar campañas para nuevas inscripciones.

## Configurar una campaña

- Nombre público y titular del anuncio.
- Periodo de inscripción con fecha y hora de inicio y fin, en horario de España.
- Descuento porcentual o fijo y duración del beneficio.
- Mes de incorporación y mes inicial del descuento, cuando corresponda.
- Condiciones completas, calendario de cobros y permanencia.
- Condiciones breves para copiar al formulario de reserva. El resumen completo tiene un límite de 1.000 caracteres.
- Enlace de inscripción de la campaña.
- Filtros combinables por sede, instrumento elegido, tamaño de grupo, día, modalidad y turnos incluidos o excluidos.

Los tamaños disponibles proceden de las clases existentes. La vista previa del editor permite revisar los turnos afectados y sus precios antes de guardar.

## Experiencia del visitante

Durante las fechas de una campaña vigente, la promoción se muestra seleccionada por defecto. El visitante puede desactivarla y volver a activarla.

Con la promoción seleccionada se ofrecen los horarios y modalidades incluidos en ella, con su descuento, condiciones y enlace de campaña. Al desactivarla se recuperan todos los horarios con sus precios, fechas, condiciones y enlaces habituales. Al finalizar la campaña desaparece el selector, salvo que haya otra campaña vigente.

El interesado puede copiar el resumen de su selección y pegarlo en el formulario de reserva. Incluye el turno, instrumento, sede, precio habitual, descuento, precio final, duración y condiciones breves. Las condiciones completas siguen visibles en la web.

La escuela contacta con la persona interesada, confirma la plaza y prepara los recibos de la campaña. Copiar el resumen o abrir el enlace no confirma una plaza ni genera un cobro.

## Campañas coincidentes

Se muestra una sola campaña para el formulario. Prevalece la de mayor prioridad; si empatan, la que empieza más tarde. Los descuentos no se acumulan.

## Borrador de Black Friday

Se incluye un borrador editable para inscripciones del 23 al 29 de noviembre de 2026 en grupos de ambas sedes, excluyendo particulares y apertura particular provisional. Enero de 2027 tiene un 50 % de descuento y se cobra a primeros de diciembre tras confirmar la plaza; febrero y marzo conservan la tarifa habitual, con permanencia durante los tres meses.

El borrador se puede modificar, pausar o conservar como referencia para crear otras campañas. No se activa automáticamente.

## Puesta en marcha

1. Publicar la aplicación.
2. Sustituir en WordPress el HTML completo de FORMULARIO_PUBLICO_WORDPRESS.html.
3. Revisar los textos generales de la página que anuncian «Sin permanencia» para aclarar las condiciones específicas de las promociones.
4. Revisar el borrador en Configuración → Promociones, habilitarlo y guardar. Antes de su fecha de inicio figurará como Programada.
5. Comprobar la publicación de plazas y el formulario público.

## Demostraciones locales

- node scripts/preview-enrollment-promotions.mjs genera una demostración del formulario público.
- node scripts/preview-admin-promotions.mjs genera una demostración del editor de campañas.

Las demostraciones utilizan turnos ficticios. Su guardado es simulado y no modifica la plataforma.
