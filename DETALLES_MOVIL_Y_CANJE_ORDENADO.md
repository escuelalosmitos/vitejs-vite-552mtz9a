# Detalles en móvil y orden del canje de tickets

## Archivos de la aplicación

Añadir primero:

- `src/components/ResponsiveAdminDetail.jsx`

Sustituir:

- `src/components/AdminPortal.jsx`
- `src/components/AdminLayout.css`
- `src/components/StudentPortal.jsx`

Conviene confirmar los cuatro archivos juntos en GitHub. El portal de administración importa el nuevo componente y necesita que esté presente para compilar.

No hay cambios en Firestore, Apps Script ni el formulario web.

## Comportamiento

En ordenador se conserva el listado con su panel de detalle. Cuando falta espacio, seleccionar un registro abre su detalle en una ventana superpuesta, con cabecera y botón de cierre visibles y desplazamiento propio. La ventana se coloca fuera del contenedor de administración para evitar que aparezca debajo del registro seleccionado.

Se aplica a los trámites pendientes de Bandeja, las fichas de Alumnos, las clases de Clases globales y Localizador, las publicaciones del Tablón y los Talleres. Historial y gestiones por consolidar conservan su presentación informativa.

El límite se calcula sobre el ancho disponible del contenido: 900 píxeles en bandeja, alumnos, publicaciones y talleres; 1100 píxeles en las vistas de clases, que necesitan más espacio para mantener ambas columnas. Así también se adapta a tabletas estrechas.

Al cerrar, se libera el desplazamiento de la página y se restaura la posición del listado y el foco cuando el elemento original sigue presente. Las publicaciones y talleres no abren automáticamente una ventana en móvil: es necesario seleccionarlos. Editar una publicación o taller cierra el detalle para dejar visible su editor.

En el panel del alumno, los turnos para canjear tickets se ordenan de lunes a domingo y por hora dentro de cada día. Se mantienen sus requisitos de aforo, instrumento y recuperación.

## Comprobaciones

Se prueban el selector real de canje, el cambio entre panel y ventana según el ancho, el cierre, el teclado, la restauración del desplazamiento y el acceso al editor. Se ejecutan también la batería estática y la compilación de producción. Las pruebas no acceden a datos reales ni envían mensajes.
