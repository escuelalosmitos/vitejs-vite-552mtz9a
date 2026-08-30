# Validación de seguridad y compilación

Fecha de validación: 30 de agosto de 2026.

## Resultado

- Pruebas estructurales: **7 superadas de 7**.
- Pruebas reales de reglas de Firestore en el emulador oficial: **11 superadas de 11**.
- Fallos, pruebas canceladas u omitidas: **0**.
- Código de salida del emulador: **0**.
- Compilación de producción con Vite: **correcta**.
- Auditoría de dependencias utilizadas en producción: **0 vulnerabilidades** (`npm audit --omit=dev`).

Los mensajes `PERMISSION_DENIED` que aparecen durante la prueba del emulador son esperados: corresponden a intentos que deben ser rechazados para comprobar que un visitante, alumno o profesor no puede acceder a información ajena.

## Entorno en el que se ejecutó el emulador

- Windows PowerShell.
- Node.js 24.20.0.
- npm 11.19.0.
- OpenJDK Temurin 21.0.12.1 LTS.
- Firebase CLI 15.28.2.
- Emulador de Firestore 1.22.0.

## Casos comprobados

- El visitante solo puede leer `publicData/classAvailability`.
- Un usuario autenticado sin rol no recibe acceso a datos sensibles.
- El alumno solo puede leer su ficha y sus proyecciones privadas.
- El alumno solo ve avisos destinados a alumnos y no puede realizar consultas globales.
- El alumno solo consulta sus clases, tickets y gestiones.
- Las solicitudes y evaluaciones creadas por el alumno quedan ligadas a su identidad.
- El alta de alumno solo puede reclamar una ficha con el mismo correo autenticado.
- Solo un profesor incluido en la lista privada obtiene permisos docentes.
- El profesor accede a su trabajo docente, nómina, disponibilidad y tareas, pero no a administración ni a datos de otros profesores.
- El administrador conserva el acceso completo y puede publicar la disponibilidad pública.
- La configuración de Firebase no contiene Cloud Functions.
- El cierre de sesión limpia el estado y devuelve a la pantalla de acceso.
- Los recursos visuales originales se conservan.

## Alcance

Estas pruebas validan la lógica de las reglas con datos representativos y la compilación del proyecto. No modifican ni inspeccionan los datos reales de producción. El despliegue debe realizarse de forma controlada siguiendo `DESPLIEGUE_SEGURO.md`, incluida la comprobación de la migración de datos indicada en esa guía.
