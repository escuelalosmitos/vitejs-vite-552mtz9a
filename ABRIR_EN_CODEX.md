# Abrir Escuela Los Mitos en Codex desde tu PC

## 1. Descomprimir y elegir la carpeta correcta

Descomprime el ZIP en una carpeta nueva. Dentro encontrarás `Escuela_Los_Mitos`.

La carpeta que debes abrir en Codex es la que contiene directamente estos archivos:

```text
Escuela_Los_Mitos/
  AGENTS.md
  CONTEXTO_PROYECTO.md
  ABRIR_EN_CODEX.md
  package.json
  package-lock.json
  firestore.rules
  src/
  tests/
```

No selecciones solo `src`, ni la carpeta superior si dentro de ella aún queda otra carpeta con `package.json`.

## 2. Seleccionar proyecto y ordenador

En la aplicación, selecciona Codex y «Escuela Los Mitos» si es el proyecto en el que quieres organizar este trabajo. Elige trabajar en «Este ordenador» y asocia la carpeta descomprimida. Si el proyecto ya tiene otra carpeta, comprueba cuál es la principal; para este trabajo debe ser la que contiene `AGENTS.md` y `package.json`.

La selección del nombre del proyecto no sustituye la asociación de la carpeta. El historial de Work y el de Codex permanecen separados: no debes dar por hecho que Codex habrá leído esta conversación. Por eso las decisiones importantes están incluidas en los dos archivos de contexto de la raíz.

Según la interfaz, las carpetas se añaden o ajustan desde la edición del proyecto. El nombre exacto de los controles puede variar. Lo esencial es comprobar la carpeta principal antes de editar.

## 3. Primer mensaje recomendado

Puedes pegar este mensaje al iniciar:

> Continúa el proyecto Escuela Los Mitos de esta carpeta. Lee AGENTS.md y CONTEXTO_PROYECTO.md, comprueba que estás en la raíz con package.json y revisa los cambios locales si existe Git. Antes de introducir funciones nuevas, resume la arquitectura, las reglas de negocio críticas, el resultado de las pruebas disponibles y lo que realmente sabes del despliegue. Conserva la separación entre oferta web de plazas fijas y aforo de recuperaciones por fecha, la dependencia de Mitolocker respecto a una plaza de clases y los contratos de Mitobox ya aceptados. Comprueba el entorno y utiliza pruebas locales o emuladas. No hay un encargo pendiente de corregir retrospectivamente una clase concreta. Después continuaremos con la siguiente tarea que te indique.

## 4. Entorno de desarrollo

Se necesita Node.js 22.12 o posterior. Para las pruebas de reglas de Firebase, JDK 21 o posterior. En PowerShell, desde la raíz:

```powershell
node --version
java -version
npm.cmd ci
npm.cmd run test:security
npm.cmd run build
```

`npm ci` instala las dependencias de `package-lock.json`; no vienen incluidas en el ZIP. Las pruebas de seguridad usan un proyecto ficticio en el emulador, sin datos reales. La CLI puede descargar el emulador oficial en la primera ejecución.

Para servir la interfaz durante una tarea de desarrollo se utiliza `npm.cmd run dev`. La configuración del frontend apunta al Firebase real: no equivale a una base de datos aislada, y entrar como Admin puede iniciar sincronizaciones. Para una primera revisión bastan las pruebas y la compilación.

## 5. Qué incluye esta entrega

Todo el código y los recursos de la última versión revisada, el formulario público, reglas e índices, pruebas y documentación. Se añaden instrucciones persistentes para Codex y contexto de traspaso. En `referencias` se incluyen el manual de marca, los logotipos aportados y una copia histórica de Apps Script identificada como no contrastada con el despliegue actual.

No se incluyen `node_modules`, compilados `dist`, una base de datos, sesiones de acceso ni el historial Git del PC. Se reconstruyen las dependencias y la compilación con los comandos indicados. Ninguna de esas exclusiones elimina código fuente del proyecto.

## Fuentes de configuración de Codex

Documentación oficial consultada el 5 de noviembre de 2026:

- https://learn.chatgpt.com/docs/projects
- https://learn.chatgpt.com/docs/environments/modes
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
