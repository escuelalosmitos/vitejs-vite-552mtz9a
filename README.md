# Escuela Los Mitos

Aplicación de gestión de Escuela Los Mitos, con portales de Administración, Profesor y Alumno. Código completo preparado para continuar el desarrollo en Codex desde un ordenador local.

## Empezar

1. Abre esta carpeta, la que contiene `package.json` y `AGENTS.md`.
2. Sigue `ABRIR_EN_CODEX.md` para asociarla al proyecto y arrancar en Windows.
3. Lee `CONTEXTO_PROYECTO.md` para conocer la arquitectura, decisiones y estado real del trabajo.

## Entorno y comandos

Node.js 22.12 o posterior. Para las pruebas del emulador Firebase, JDK 21 o posterior.

```bash
npm ci
npm run test:security
npm run build
```

Para desarrollo: `npm run dev`. En PowerShell puedes utilizar `npm.cmd` si la política de ejecución afecta al comando `npm`.

El frontend conserva su configuración Firebase real. Vite local no es una base de datos de pruebas: utiliza las pruebas incluidas o un emulador para verificar sin operar sobre producción.

## Estado de referencia

La revisión del 5 de noviembre de 2026 supera 221 pruebas locales y 48 comprobaciones de reglas/transacciones, y compila correctamente. Las correcciones autorizadas y el contrato Mitoverso se publicaron ese día en Vercel y Firestore, con autorización expresa de Paco. La web de alumnos sirve los archivos compilados comprobados y las reglas activas coinciden con el archivo probado. Consulta `PUBLICACION_2026-11-05.md` para las referencias y límites de verificación. Las sesiones que estuvieran abiertas deben recargarse.

## Decisiones esenciales

- Recuperaciones: aforo por fecha, reserva pendiente y aprobación transaccional.
- Oferta web: plazas de matrícula fija, sin restar recuperaciones.
- Mitolocker: compartido gratis y exclusivo 5 €/mes; requiere una plaza de clases.
- Mitobox: contrato aceptado antes de solicitar el alta, con versiones históricas y evidencia conservadas.
- Aplicación en Vercel; Auth, datos y almacenamiento en Firebase; integraciones externas de Apps Script y cobros en Tadosi.

Consulta `DESPLIEGUE_SEGURO.md` y la documentación del módulo correspondiente antes de publicar cambios. El README genérico original de la plantilla se conserva en `referencias/README_ORIGINAL_PLANTILLA.md`.
