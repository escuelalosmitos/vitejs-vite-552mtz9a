# Despliegue seguro de la separación por roles

Este proyecto mantiene la interfaz y los recursos originales. El despliegue se
hace por fases para que la plataforma en producción no se quede sin servicio.

## 1. Copia de seguridad

1. Trabaja en una rama distinta de `main`.
2. En Firebase Console, abre **Firestore Database > Rules** y guarda una copia
   del contenido actualmente publicado.
3. No borres ningún índice existente durante el proceso.
4. Comprueba en Vercel que la versión actual de `main` sigue marcada como
   **Production** y que la rama de seguridad aparece únicamente como **Preview**.

## 2. Instalar y compilar

Desde la raíz del proyecto:

```bash
npm ci
npm run build
npm run test:security
```

Los tres comandos deben terminar correctamente. `test:security` arranca un
Firestore local y comprueba operaciones reales por rol; no usa la base de datos
de producción. En Windows se puede seguir `PRUEBA_SEGURIDAD_WINDOWS.md`.

No continúes con los pasos siguientes mientras exista un test fallido.

## 3. Preparar los datos privados antes de cambiar las reglas

Abre el despliegue **Preview** de la rama de seguridad en Vercel e inicia sesión
como administrador. Como alternativa, arranca temporalmente la versión nueva en
el ordenador:

```bash
npm run dev
```

Abre la dirección local que indique Vite e inicia sesión como administrador.
Espera a que el portal termine de cargar. Este acceso prepara automáticamente:

- `artifacts/default-app-id/staffAccess`
- `artifacts/default-app-id/roleData/studentSettings`
- `artifacts/default-app-id/roleData/studentClassCatalog`
- el campo `studentIds` de las clases que todavía no lo tuvieran
- el campo normalizado `studentEmail` de los tickets antiguos

En Firebase Console comprueba que existen esos documentos y que los campos
`settings/global.studentClassIndexVersion` y
`settings/global.studentTicketEmailIndexVersion` valen `1`. Si utilizaste Vite,
detén el proceso con `Ctrl+C`.

## 4. Publicar

Autentica Firebase si todavía no lo has hecho:

```bash
npx firebase-tools login
```

Publica primero el índice. Si Firebase pregunta si debe borrar otros índices ya
existentes, responde **No**:

```bash
npx firebase-tools deploy --project escuela-musica-app --only firestore:indexes
```

Cuando el índice esté habilitado, incorpora la rama probada a `main`. La
integración Git de Vercel creará automáticamente el despliegue **Production**.
Espera a que Vercel indique **Ready** y comprueba que Administración carga y que
el cierre de sesión vuelve a la pantalla de acceso.

No ejecutes `firebase deploy --only hosting`: la aplicación está alojada en
Vercel y `firebase.json` configura únicamente Firestore.

Finalmente publica las reglas:

```bash
npx firebase-tools deploy --project escuela-musica-app --only firestore:rules
```

No se despliegan Firebase Hosting ni Cloud Functions.

## 5. Verificación posterior

Comprueba en una ventana privada del navegador:

1. La consulta pública de plazas continúa funcionando sin iniciar sesión.
2. Un alumno accede únicamente a su perfil, sus clases y sus gestiones.
3. Un profesor accede al portal docente y a su propia información de nómina.
4. Administración mantiene acceso completo.
5. Al cerrar sesión se muestra de nuevo la pantalla de acceso.

Si falla la web, restaura la versión **Production** anterior desde el historial
de despliegues de Vercel. Si fallan los permisos, vuelve a publicar la copia
anterior de las reglas que guardaste en el primer paso y después investiga el
rol afectado antes de intentarlo de nuevo.
