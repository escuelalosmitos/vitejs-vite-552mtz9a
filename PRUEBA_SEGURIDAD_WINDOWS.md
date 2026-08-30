# Prueba local de seguridad en Windows

Esta prueba utiliza una base de datos ficticia y temporal llamada
`demo-escuela-seguridad`. No inicia sesión en Firebase, no consulta alumnos
reales, no modifica producción y no despliega ningún archivo.

## 1. Abrir la carpeta correcta

1. Descomprime el ZIP en una carpeta nueva.
2. Abre esa carpeta en el Explorador de Windows.
3. Comprueba que ves `package.json`, `firebase.json` y `firestore.rules`.
4. Haz clic en la barra de dirección del Explorador, escribe `powershell` y
   pulsa **Intro**.

La ventana azul debe abrirse directamente en la carpeta del proyecto.

## 2. Comprobar Node.js y Java

Copia estos dos comandos, uno cada vez:

```powershell
node --version
java -version
```

Se necesita Node.js 18 o posterior y Java 11 o posterior. Si cualquiera de los
dos comandos dice que no se reconoce, detente y comunica exactamente el
mensaje recibido antes de continuar.

## 3. Instalar las dependencias del proyecto

```powershell
npm.cmd ci
```

La primera ejecución puede tardar varios minutos. Los avisos que empiezan por
`npm warn` no significan por sí solos que la instalación haya fallado. Debe
terminar sin una línea `npm error`.

## 4. Ejecutar toda la validación

```powershell
npm.cmd run test:security
```

La primera vez, Firebase descargará el emulador de Firestore. Es una descarga
oficial que queda guardada en el ordenador para las siguientes pruebas.

La validación realiza dos bloques:

- comprobaciones estructurales y conservación de recursos;
- operaciones reales simuladas como visitante, usuario sin rol, alumno,
  profesor y administrador.

El resultado correcto debe mostrar todos los tests como superados, sin ningún
`fail` ni `not ok`. Al final Firebase detendrá automáticamente el emulador.

## 5. Enviar el resultado

No ejecutes ningún comando `firebase deploy`. Copia todo el texto que aparezca
desde `npm run test:security` hasta el final y envíalo para revisarlo. Si hay un
fallo, no despliegues el proyecto: el texto indicará qué permiso debe corregirse.

## Problemas frecuentes

### `node` o `npm` no se reconoce

Falta Node.js o Windows todavía no ha actualizado la terminal después de
instalarlo. Cierra PowerShell, vuelve a abrirlo y repite la comprobación.

### `java` no se reconoce

Falta un JDK de Java o no está incorporado a `PATH`. No basta con algunas
versiones antiguas del entorno de ejecución de Java; debe instalarse un JDK.

### El puerto 8080 ya está ocupado

Cierra otras ventanas donde pueda estar ejecutándose Firebase y vuelve a
probar. Si persiste, copia el error completo antes de cambiar la configuración.

### Windows muestra una alerta de red para Java

El emulador solo necesita escuchar en el propio ordenador. Puede permitirse en
redes privadas y mantenerse bloqueado en redes públicas.
