# Escuela Los Mitos — contexto y traspaso a Codex

Preparado el 5 de noviembre de 2026 a partir de la última entrega completa revisada. Este documento transfiere decisiones y estado del trabajo; no es una copia literal de todo el historial de conversaciones ni una exportación de producción.

## 1. Qué es y para quién se desarrolla

Escuela Los Mitos es una escuela privada de música con sedes en Tarragona y Reus. Paco Mitos dirige el proyecto y decide sus reglas de negocio. La aplicación permite gestionar clases, alumnos, profesores, servicios, recuperaciones, asistencia, comunicaciones y análisis económico, con un área propia para el alumno.

El objetivo es continuar esta aplicación conservando lo ya construido. No hay un encargo de rehacerla o cambiar su arquitectura por el hecho de abrirla en Codex.

## 2. Arquitectura real y servicios externos

| Parte | Ubicación o tecnología | Observación |
|---|---|---|
| Aplicación | React 19 + Vite 8, JavaScript/JSX | `src/App.jsx` conecta Firebase y resuelve los perfiles. |
| Administración | `src/components/AdminPortal.jsx` | CRM, clases, localizador, bandeja, BI, publicación de plazas y coordinación. |
| Profesorado | `src/components/TeacherPortal.jsx` | Sesiones, asistencia, tickets, recuperaciones y operativa docente. |
| Alumnado | `src/components/StudentPortal.jsx` | Horario, avisos de falta, trámites, servicios Extras, actividades y perfil. |
| Servicios | `src/components/ServicesAdmin.jsx` y módulos específicos | Gestión administrativa de servicios y reservas. |
| Datos y acceso | Firebase Auth, Firestore, Storage | Reglas en `firestore.rules` y `storage.rules`; índices en `firestore.indexes.json`. |
| Alojamiento | Vercel | El proceso documentado utiliza la integración del repositorio con Vercel. |
| Formulario público | `FORMULARIO_PUBLICO_WORDPRESS.html` | Se integra en WordPress y consume la disponibilidad publicada en Firestore. |
| Correos e integraciones | Google Apps Script externo | Los endpoints se referencian en el código. Una solicitud de envío no garantiza por sí sola entrega del correo. |
| Cobros y domiciliación | Tadosi / GoCardless, operativa externa | No suponer una API de cobro automatizada por ver botones de gestión en la aplicación. |

Dependencias y versiones concretas: `package.json` y `package-lock.json`. El identificador del espacio de datos es `default-app-id`, distinto del identificador del proyecto Firebase `escuela-musica-app`.

La configuración web de Firebase ya está en `src/App.jsx`; no se requiere inventar un `.env` para poder compilar. No se han incluido contraseñas, sesiones, claves privadas administrativas, un volcado de alumnos ni una exportación de base de datos.

**Atención al entorno:** al ejecutar Vite se sirve una copia local del frontend, pero su configuración sigue apuntando al backend real. Abrir Admin con una cuenta real puede activar sincronizaciones y publicaciones. Las pruebas incluidas utilizan dobles o el emulador con un proyecto `demo-`; no deben cambiarse para usar datos reales.

## 3. Identidad y acceso

- El administrador configurado es `paco@escuelalosmitos.com`.
- El correo corporativo por sí solo no basta para adquirir acceso docente: se utiliza la autorización de `staffAccess`.
- Los alumnos tienen vínculos de acceso con su ficha. Un UID de autenticación y un ID de ficha de alumno no son necesariamente iguales.
- Puede haber un familiar o titular pagador detrás del correo de un alumno. No deducir asistencia, propiedad de una plaza o identidad del alumno a partir del nombre del titular.
- Los portales necesitan distinguir bajas, plazas futuras, grupos en formación y servicios independientes para determinar los accesos correspondientes.

En Firestore hay datos bajo `artifacts/default-app-id/`, entre ellos `students`, `access`, `staffAccess`, `gestiones`, `roleData`, reservas y datos docentes bajo `users/{uid}`. Las clases y tickets se encuentran también en esos espacios de usuario. Lee las reglas y las consultas concretas antes de alterar un permiso.

La separación por roles no significa que cada docente solo pueda leer toda la operativa de sus propias clases: hay lecturas operativas compartidas para coordinación y sustituciones. Las escrituras, datos privados y nóminas tienen restricciones específicas. No simplificar estas reglas sin comprobar sus casos permitidos y denegados.

## 4. Decisión crítica: matrícula frente a aforo de cada sesión

Son dos cálculos diferentes que deben permanecer separados:

| Situación: clase de capacidad 4 | Oferta web de matrícula | Recuperaciones para esa fecha |
|---|---|---|
| Tres alumnos fijos | Una plaza fija libre | Puede existir un hueco de recuperación. |
| Tres fijos y una recuperación pendiente | Sigue ofreciendo una plaza fija | El hueco queda retenido para esa fecha. |
| Tres fijos y una recuperación aprobada | Sigue ofreciendo una plaza fija | La sesión queda completa para nuevas recuperaciones. |
| Cuatro plazas fijas comprometidas | No ofrece otra plaza fija | No admite otra recuperación sin aforo disponible. |

Una recuperación de otra fecha no ocupa el aforo de esta sesión. Un aviso de ausencia no libera automáticamente una plaza fija para ofrecer otra recuperación. La oferta pública se determina por compromisos de matrícula, no por el número de asistentes previsto en una semana concreta.

La distinción se comprobó ejecutando el publicador real de Admin: añadir una recuperación pendiente o aprobada no cambia las plazas ni la firma del documento público; una cuarta matrícula fija sí agota la oferta. Esta comprobación adicional no añadió una prueba permanente al script del proyecto.

### Publicación para la web

`src/components/AdminPortal.jsx` genera `publicData/classAvailability`. El formulario de WordPress, la vista administrativa de plazas públicas y las ampliaciones usan esa fuente. No debe contener alumnos, correos, notas, rutas internas de Firestore ni IDs de gestiones.

`src/components/publicEnrollmentUtils.js`, `src/components/PublicEnrollmentView.jsx` y `src/components/classExpansionUtils.js` conservan la equivalencia con el formulario real, los IDs públicos estables, fechas futuras, grupos en formación y reglas de incorporación. No sustituir esta publicación por una reconstrucción basada en alumnado activo del Localizador o en una proyección del mes siguiente.

### Control de recuperaciones implementado

- `src/components/recoveryCapacityUtils.js` calcula ocupación por fecha, fechas disponibles y firmas de publicación.
- `src/components/recoveryCapacityStore.js` centraliza las transacciones de publicación, reserva, aprobación y liberación. Student, Admin y Profesor utilizan ese control compartido.
- Admin publica calendarios anónimos de disponibilidad para los próximos 120 días en `recoveryAvailability`. Si no hay disponibilidad publicada, Student bloquea el envío y explica que falta sincronizar.
- La solicitud guarda la ruta de clase exacta, retiene un hueco de esa fecha y establece una reclamación exclusiva del ticket en `recoveryTicketClaims/{owner}/claims/{ticketId}`.
- Una solicitud pendiente consume aforo y el ticket no puede retener a la vez otra recuperación futura incompatible.
- La aprobación relee la plantilla guardada, la gestión, la disponibilidad y el ticket. Incorpora al alumno, completa la gestión y transforma la retención en plaza confirmada de forma atómica.
- Dos solicitudes simultáneas por el último hueco solo permiten reservar a una. Una aprobación simultánea Admin/Profesor no duplica al alumno.
- Rechazar libera la retención y el ticket. Cancelar una recuperación aprobada retira solo esa recuperación, conservando las de otras fechas.
- Se tienen en cuenta fechas de plaza, mantenimiento y recolocaciones en las entradas disponibles; no reducir una ocupación ya publicada por una copia parcial del profesor.
- Las aprobaciones no deben apoyarse únicamente en arrays de React: esa fue una de las causas de sobreocupación.

La corrección cubre el circuito de solicitudes y aprobaciones de recuperación. Las altas o ediciones manuales de plantillas siguen sus procedimientos existentes; no se ha demostrado una garantía universal para cualquier escritura manual posterior. Si una tarea futura toca matrículas o plantillas, comprobar su interacción con recuperaciones ya comprometidas sin reducir por ello la oferta web.

El usuario indicó expresamente que se deje de tratar el incidente histórico de una clase concreta. No hay un encargo pendiente de cancelar, mover o corregir automáticamente esos alumnos. El propósito es prevenir nuevos casos.

## 5. Servicios y bajas

### Mitolocker

- Compartido: gratis, permitiendo el uso del instrumento por otros alumnos.
- Exclusivo: 5 €/mes, reservado a su propietario.
- Las modalidades son excluyentes y requieren una plaza de clases.
- Se solicita desde Extras y llega como gestión pendiente a Administración. La modalidad de pago conserva el circuito de gestión de domiciliación; el gratuito no requiere preparar un cobro.
- Está reflejado en fichas, Servicios y BI. Solo el exclusivo aporta 5 €/mes a los ingresos.
- Se cancela al abandonar la última plaza de clases, aunque no se haya marcado expresamente su casilla. Si se mantiene otra plaza, puede conservarse.
- Las tarjetas de Mitolocker van después de Mitoverso y Mitobox. Icono seguido del nombre, sin separación artificial; «Compartido» y «Exclusivo» con menor tamaño que «MITOLOCKER».

### Bajas selectivas

Si hay servicios activos, el alumno puede seleccionar con casillas de qué plaza o servicios solicita la baja. Si solo tiene su plaza, se conserva la experiencia sencilla de baja habitual. La solicitud se revisa en la bandeja de Admin; no equivale a desactivar inmediatamente la cuenta.

Mitobox, Mitoverso y Gymusik pueden mantenerse sin una plaza de clases según su circuito. Mitolocker no. La consolidación respeta la fecha efectiva y los servicios conservados; no bloquear todo el acceso por una baja parcial.

`src/components/fixedServicesUtils.js` concentra la lógica común. Documentación: `MITOLOCKER_Y_BAJAS_SERVICIOS.md`, que es histórica para versiones anteriores y no sustituye a las instrucciones actuales de reglas y contrato.

### Mitobox y contrato

- Antes de solicitar el alta se abre un modal de contrato con aceptación obligatoria, inicialmente desmarcada.
- Incluye nombre y apellidos del contratante y del alumno y representación cuando corresponde. La plataforma no guarda el DNI del cliente; la comprobación administrativa de identidad y representación se hace con la documentación de Tadosi.
- Cuota contractual: 35 €/mes para alumno con plaza; 50 €/mes para externo. No cambiar una cuota aceptada silenciosamente.
- Se conserva el texto exacto aceptado, versión, huella SHA-256 y sello temporal del servidor, además de la opción de inicio anticipado cuando corresponde.
- Dirección del prestador confirmada: Carrer Assalt, 1 (Tarragona).
- Los contratos nuevos usan la versión v2; se mantiene la verificación y descarga de los v1 ya aceptados sin reescribir su contenido.
- La revisión de Tadosi es manual; no hay una consulta automática de DNI por el hecho de marcar «Tadosi hecho».

Módulos: `src/components/mitoboxContractUtils.js`, `src/components/MitoboxContractForm.jsx`, `src/components/mitoboxUtils.js`, `src/components/ServicesAdmin.jsx` y los portales. El contrato aceptado es evidencia histórica, no una plantilla que pueda regenerarse libremente con condiciones nuevas.

## 6. Asistencia, tickets y últimas correcciones de reglas

Un aviso de falta y el estado informativo de su gestión son cosas distintas de la asistencia real. Un aviso archivado puede necesitar conciliación si finalmente consta que el alumno asistió.

`src/components/absenceAttendanceUtils.js` y `src/components/absenceAttendanceReconciliation.js` buscan coincidencia de alumno, clase y fecha y releen los documentos antes de conciliar. El ticket no utilizado relacionado con esa ausencia se anula cuando hay asistencia confirmada. No se anulan regalos ni tickets de otras fechas o alumnos por similitud de nombres.

Si un ticket relacionado ya se consumió, se conserva el registro y se genera una incidencia pendiente para Admin. La repetición de la conciliación no debe duplicar incidencias. Un ticket de recuperación programada se consume con la asistencia según el flujo existente; solicitar o aprobar no equivale a afirmar que asistió.

La última revisión resolvió tres comprobaciones fallidas:

1. **Tablón dirigido:** la consulta `array-contains` de destinatarios era rechazada aunque una lectura individual autorizada funcionara. Se separaron las condiciones de listado para permitir las consultas justificadas por sus filtros, manteniendo denegación de listados indiscriminados o dirigidos a otro alumno.
2. **Anulación por asistencia:** las comprobaciones repetidas de reglas agotaban el límite de expresiones en el lote atómico. Se colocó primero una comprobación acotada de corrección por asistencia y se reutiliza una sola lectura de la evidencia del registro; se mantienen profesor autorizado, propiedad del espacio, ticket no usado y campos permitidos.
3. **Prueba musical:** el test intentaba cambiar el identificador a `composer-v1` incluso cuando ya tenía ese mismo valor. Se corrigió para elegir siempre uno distinto. Este falso positivo no requirió abrir permisos del catálogo musical.

Documentación y pruebas relevantes: `CORRECCION_AVISOS_ASISTENCIA.md`, `TABLON_FILTRADO_Y_ARCHIVO.md`, `tests/absence-attendance.test.mjs`, `tests/firestore-rules.test.mjs`.

## 7. Otros módulos existentes que se deben conservar

- Localizador de clases, alternativas y comunicaciones, con distinción entre actividad docente, oferta pública y grupos en formación.
- Ampliación de clases con fecha propia de inicio; no confundir antigüedad del alumno con inicio de una nueva plaza. Un grupo en formación no activa por sí solo cuota o asistencia.
- BI con filtros, previsiones y separación de ingresos de servicios; no reescribir históricos sin un encargo concreto.
- Avisos de ausencia y correos por profesor con mapa de cuentas corporativas. Conservar el destinatario configurado y no afirmar entrega si solo se ha solicitado el envío.
- Tablón, notificaciones, encuestas y convocatorias con destinatarios y archivo; mantener privacidad y exclusión de publicaciones docentes en Student.
- Gymusik, reservas Mitobox y aforo de salas son circuitos distintos del aforo de recuperación de una clase.
- Trivial diario, retos musicales y actividades de vacaciones; conservar el reloj/fecha escolar, semillas, progreso y prevención de duplicados.
- Recursos, perfil y fotos de alumnos; se corrigió una validación de rutas de foto que podía impedir el acceso de cuentas ya registradas.
- Panel del alumno: se corrigió un `startsWith` sobre `null` en el circuito de servicios. Una ventana cerrada puede tener estado `null`; no atribuir ese fallo al aviso de Tailwind del navegador.

Para cada módulo hay documentación histórica en los archivos Markdown de la raíz. Los recuentos de tests y listas de archivos de esos documentos corresponden a sus versiones; no tratarlos como instrucciones acumulativas que obliguen a reinstalar parches antiguos.

## 8. Mapa de documentación

| Necesidad | Documento |
|---|---|
| Abrir el proyecto en el PC y primer mensaje a Codex | `ABRIR_EN_CODEX.md` |
| Último arreglo funcional completo | `LEEME_ACTUALIZACION.md` |
| Despliegue por Vercel y reglas/índices Firebase | `DESPLIEGUE_SEGURO.md` |
| Entorno Windows y pruebas | `PRUEBA_SEGURIDAD_WINDOWS.md` |
| Matrículas, ampliaciones y formación | `AMPLIACIONES_CON_APERTURA_FUTURA.md`, `OFERTA_WEB_Y_ORDEN_LISTAS.md` |
| Fuente pública de plazas | `LOCALIZADOR_FORMULARIO_PUBLICO.md` |
| Aforo de recuperación | `RECUPERACIONES_AFORO.md` |
| Servicios y contrato | `MITOLOCKER_Y_BAJAS_SERVICIOS.md`, `CONTRATO_MITOBOX_Y_ORDEN_EXTRAS.md` |
| Asistencia y avisos | `CORRECCION_AVISOS_ASISTENCIA.md` |
| BI y comunicaciones dirigidas | `BI_Y_FILTROS_TABLON.md`, `TABLON_FILTRADO_Y_ARCHIVO.md` |
| Integración externa disponible como referencia | `referencias/LEEME_APPS_SCRIPT.md` |

## 9. Qué está verificado y qué no

La última revisión funcional, del 4 de noviembre de 2026, terminó con:

- `npm run test:static`: 192 comprobaciones superadas.
- Pruebas de reglas y transacciones: 36 comprobaciones superadas.
- `npm run test:security` completo: código de salida 0, usando Node.js 24, Java 21 y Firestore Emulator 1.22.0.
- `npm run build`: correcto; conserva el aviso de tamaño elevado de algunos paquetes JavaScript.

Este traspaso añade documentación, referencias de marca y una copia identificada de referencia de Apps Script; no modifica la lógica de la aplicación, sus reglas, dependencias ni pruebas. Se comprueba la integridad del ZIP y que todos los archivos de la entrega anterior se conservan, con la excepción documentada del README y las notas de entrada actualizadas.

No se ha certificado un ESLint global limpio ni se ha verificado una sesión real en el ordenador Windows del usuario. El aviso de Tailwind CDN en producción y el tamaño de los portales son asuntos existentes, no fallos nuevos corregidos en este traspaso.

No se ha desplegado desde este trabajo ni consultado o corregido la base de datos real durante las pruebas. Se desconoce si Paco ha publicado después alguna de las entregas. Al iniciar en el PC, verificar el estado real del repositorio, Vercel y las reglas antes de hacer afirmaciones sobre producción.

## 10. Alcance y pendientes al comenzar en el PC

La tarea actual es dejar el proyecto listo para continuar en Codex. No hay un siguiente cambio funcional elegido. El módulo de temarios se ha mencionado como trabajo futuro para el curso 2027–2028; no debe iniciarse automáticamente ni suponerse implementado en esta carpeta.

Primeros pasos útiles: comprobar que se está en la carpeta correcta, identificar si ya existe Git y cambios locales, leer estas decisiones, revisar Node/Java y ejecutar las pruebas necesarias. Después, continuar con el siguiente encargo de Paco.

La entrega inicial no contenía el historial Git original, una copia íntegra del chat ni todos los archivos del proyecto empresarial «Escuela Los Mitos» en ChatGPT. Contiene el código completo disponible, sus recursos, reglas, pruebas, documentación y este contexto técnico y de negocio pertinente. No inferir credenciales, permisos de publicación o decisiones adicionales a partir del nombre del proyecto.

## 11. Historial Git recuperado en el PC — 5 de noviembre de 2026

Paco facilitó el repositorio `https://github.com/escuelalosmitos/vitejs-vite-552mtz9a`. Se descargó su historial mediante un clon completo de tipo bare en `referencias/historial-original.git`, sin sustituir los archivos de trabajo ni convertir la raíz de esta carpeta en un repositorio Git. La copia contiene 566 commits y seis ramas; `main` apunta al commit `e4636ec`, del 4 de noviembre de 2026. Se comprobó la conectividad de los objetos con `git fsck --connectivity-only`.

La comparación con `main`, normalizando los saltos de línea, no encontró diferencias en los archivos de `src`. Sí difieren `firestore.rules`, `storage.rules`, `package.json` y cuatro archivos de pruebas; además, la carpeta de trabajo contiene doce archivos de pruebas adicionales. No reemplazar la carpeta actual por el clon ni asumir que GitHub contiene todas las correcciones locales de seguridad y validación. Esta comparación no confirma el código o las reglas publicados en Vercel/Firebase.

Para consultar esta copia desde la raíz: `git --git-dir=referencias/historial-original.git log`. Al ser un clon bare, los archivos históricos se consultan con `git show` o `git diff`; no tiene una carpeta de trabajo propia. El clon es una referencia del estado descargado, no una sincronización automática ni un historial de los futuros cambios de esta carpeta.

## 12. Auditoría local — 5 de noviembre de 2026

Paco solicitó analizar incoherencias, errores y permisos. El resultado está en `auditoria/2026-11-05/INFORME.md`: diez hallazgos confirmados mediante siete escenarios nuevos en Firestore Emulator y ocho reproducciones de funciones reales con dobles. Incluyen activación sin verificar correo, repetición de mutaciones de contadores Mitobox/Gymusik, alcance excesivo de mapas de asistencia para alumnos, colisiones de identidad de clase en bajas/cambios/ausencias, creación de gestiones heredadas migrables a reservas, créditos Gymusik concurrentes, altas directas Mitobox sin evidencia/tarifa externa, revocación incompleta del vínculo de acceso, antelación real de Mitobox y mezcla de expedientes por correo familiar.

En esa fase de auditoría no se corrigieron los hallazgos ni se comprobó su presencia en producción. Se añadieron únicamente el informe, las reproducciones y `firebase.audit.local.json`, una configuración separada para puertos de emulación. El estado posterior de implementación se recoge en el apartado 13.

Las 36 comprobaciones originales de reglas/transacciones siguen pasando junto a los escenarios nuevos. Las reproducciones de auditoría esperan el comportamiento defectuoso para demostrarlo: antes de convertirlas en regresiones permanentes hay que invertir las expectativas al implementar cada corrección. Priorizar permisos y aforo, y la identidad canónica en bajas; no usar los hallazgos para reabrir la corrección retrospectiva de la clase histórica. La interacción entre cambios temporales de horario y publicación del aforo de recuperación queda como comprobación adicional pendiente, sin considerarse un fallo confirmado de extremo a extremo.

## 13. Correcciones autorizadas y Mitoverso — 5 de noviembre de 2026

Paco autorizó corregir los puntos 2, 3, 4, 5, 6, 8 y 9. Se prepararon y probaron localmente y, tras su autorización posterior, se publicaron el mismo día (apartado 14). Detalle en `CORRECCIONES_AUDITORIA_Y_MITOVERSO.md`. Resultado: 221 pruebas estáticas/de comportamiento y 48 comprobaciones de reglas/transacciones superadas, compilación correcta. Se conserva el aviso de tamaño del paquete y no se certifica un ESLint global limpio.

Las reglas de Firestore que Paco aportó desde un texto adjunto son idénticas byte por byte a la base auditada. Se conservan en `referencias/firestore-aportadas-2026-11-05.rules`. El archivo de trabajo `firestore.rules` contiene las correcciones; se comprobó que sus contenidos coinciden con las reglas publicadas tras el despliegue del apartado 14. No confundirlo con la copia histórica.

Decisiones explícitas de Paco: el punto 1 (verificación del correo) se deja como está. El alta y los pagos de externos se gestionan en Tadosi y después Administración los incorpora a la plataforma: se mantienen las altas directas y no se fuerza un contrato retroactivo por esa vía. El punto 10 se reserva a una reforma de cuentas familiares con varias personas y nombres bajo una cuenta; no se modifica ahora el vínculo de acceso de una sola ficha.

El alumno sigue pudiendo avisar de su propia falta y gestionar su recuperación. Se restringen las escrituras sobre compañeros/otras fechas y se validan los cambios de aforo contra una transición real de reserva. La baja total contrasta el derecho vigente en reglas, conservando el acceso de quien mantenga servicios independientes. Las rutas canónicas prevalecen en bajas, cambios temporales, autorizaciones y proyecciones; un ID ambiguo no elige automáticamente otra clase.

Gymusik incorpora `gymusikCredits/{studentId}/months/{mes}` y la preparación administrativa de reservas antiguas, marcada con `gymusikMembers.creditLedgerVersion = 1`. Las reservas y cancelaciones actualizan ese saldo en transacción. Administración publica también capacidades de sala Mitobox en `roleData/studentSettings.mitoboxRoomCapacities`, sin datos de alumnos. Las nuevas reglas y el cliente anterior no son plenamente compatibles: preparar los datos desde Preview, coordinar frontend/reglas y recargar sesiones al publicar.

Paco aportó el contrato completo de Mitoverso y pidió adaptarlo al de Mitobox sin DNI/NIE del cliente. Se incorporan las 28 cláusulas, identificación de contratante/usuario y representación, revisión manual de identidad en Tadosi, aceptación obligatoria, texto exacto, versión `mitoverso-2026-11-05-v1`, huella SHA-256, recepción del servidor y copia descargable. Nuevas solicitudes: 10 €/mes con plaza de clases y 20 €/mes sin plaza. No se modifican los contratos Mitobox aceptados ni se cambian silenciosamente las cuotas antiguas Mitoverso de 15 €; Tadosi continúa siendo manual.

## 14. Publicación confirmada — 5 de noviembre de 2026

Paco autorizó expresamente pasar las correcciones a producción. Se creó la rama `codex/correcciones-auditoria-mitoverso-20261105`, se verificó el Preview y se actualizó `main` al commit `426b87cb547328bc007180578da46c15c0a18378`. Vercel confirmó los cuatro despliegues automáticos como correctos. El proyecto de la web de alumnos es `vitejs-vite-552mtz9a-123k` (`prj_6tQVDzzzEeZQpVmzFxrtvrynup1M`), asociado a `alumnos.escuelalosmitos.com`; despliegue funcional `dpl_7p875mYZFM4bf9C6GSqRZt4hzGCd`.

Se guardaron las reglas publicadas antes de actualizar. Los índices administrativos de clases y correos de tickets ya tenían versión 1. Se añadió únicamente `roleData/studentSettings.mitoboxRoomCapacities`, con las seis capacidades reales ya configuradas, mediante una escritura condicionada a la versión leída. No había miembros Gymusik que migrar. Se publicaron solo reglas de Firestore: no índices, Storage, Hosting ni Apps Script.

Verificación del 5/11/2026 a las 14:55 CET: dominio y recursos HTTP 200; JavaScript y CSS servidos idénticos a la compilación local; reglas activas idénticas al archivo probado; oferta pública de 48 clases accesible sin autenticación y sin campos privados; configuración y miembros Gymusik rechazan acceso anónimo (403). No se verificaron sesiones reales de alumno/profesor/administrador ni operaciones que envíen correo o afecten a cobros. Recargar pestañas antiguas. Detalles, copias y reversión en `PUBLICACION_2026-11-05.md`.

## 15. Baja de servicios efectiva hoy — 6 de noviembre de 2026

Paco detectó que «Ejecutar ahora» programaba la baja de servicios aun cuando la fecha efectiva ya había llegado. El campo de fecha representa el último día con acceso. Introducir ayer da como fecha efectiva hoy. La versión anterior exigía después «Consolidar gestiones programadas vencidas» en Gestiones, que muestra el lote antes de confirmar.

Esta revisión corrige el flujo para que «Ejecutar ahora» aplique la baja de servicios cuando la fecha efectiva sea hoy o anterior. Reutiliza la consolidación selectiva y conserva la gestión en Programadas si falla la aplicación. Las fechas futuras siguen el circuito de consolidación.

## 16. Alta con contrato Mitolocker — 6 de noviembre de 2026

Paco aprobó una sola tarjeta en Extras con Compartido gratuito y Exclusivo por 5 €/mes. La selección empieza vacía y el alumno debe volver a aceptar si modifica la modalidad o los datos del contrato. Se conservan las 29 cláusulas del texto aportado, adaptadas a la aceptación en el portal y al resguardo separado. Se identifican titular, alumno y representante sin solicitar su DNI/NIE.

La solicitud exige plaza de clases y guarda en `mitolockerContract` la modalidad, cuota, instrumento propuesto, texto aceptado, versión `mitolocker-2026-11-06-v1`, huella y fecha del servidor. En Gestiones se puede revisar y descargar la aceptación. El alta con contrato actualiza la ficha y cierra la solicitud en una transacción. Para Exclusivo se comprueba Tadosi en esa transacción. Las solicitudes previas y las gestiones administrativas directas conservan su tratamiento histórico.

En Servicios → Mitolocker → Contrato y entrega, Administración puede registrar el inventario cuando recibe el instrumento y descargar el resguardo para firmarlo con el titular. El resguardo queda separado de la aceptación en `gestiones/{gestionId}/mitolockerDelivery/record`, con lectura administrativa. El alumno puede descargar su contrato desde Extras.

El frontend y `firestore.rules` deben publicarse de forma coordinada, ya que el cliente anterior envía altas de Mitolocker sin contrato. Mantener separadas las comprobaciones del emulador y cualquier revisión operativa en producción.

Paco autorizó publicar. El Preview de `codex/contrato-mitolocker-20261106` está listo con el commit `53323780b7e47d298f42d5e34f84a06a2080fb8e` y el despliegue `dpl_AsmcxaZfzkYyd4pEYNRJdCbK953L`. Se preparó en `.despliegue.local`, desde `d9d924e`, sin incluir la corrección de bajas del apartado 15. Compilación y 223 pruebas estáticas correctas en la copia aislada, con las dos plantillas de pruebas locales como archivos auxiliares sin subir.

**Publicado el 6/11/2026.** Tras renovar la sesión de Firebase, se guardó la versión anterior de las reglas en `.revision-deploy.local/mitolocker-20261106/firestore-before.rules` (ruleset `d0085831-89f8-4121-980c-fd68a85c3f21`). Se validó la compilación de las reglas sin publicar, se actualizó `main` al commit del Preview y se activaron solo las reglas de Firestore una vez que el dominio servía el contrato nuevo. Los cuatro despliegues de Vercel terminaron correctamente. El de alumnos es `dpl_8iamKvzapvNCvTzv3DSKriJA4mKX`. El anterior era `dpl_5XM343S8wko49BSz49aHzX2zDR6g` en `d9d924e`. Si hay que revertir, coordinar web y reglas.

Comprobación a las 10:02 CET: dominio HTTP 200, `index-D9rqEh79.js` idéntico a la compilación local y con el contrato `mitolocker-2026-11-06-v1`. Las reglas publicadas coinciden con las probadas, ruleset `237d84c0-0c7f-4516-960e-14f1212da4f8`, SHA-256 `508932620ddf77d3bb19dfde9412cf921e9b00b2232a48b1dd4bb07e7c12864f`. La oferta pública respondió 200 y la configuración privada rechazó acceso anónimo con 403. Las 49 comprobaciones de reglas pasaron en el emulador de la copia de publicación. No se hicieron altas ni entregas reales como prueba.
