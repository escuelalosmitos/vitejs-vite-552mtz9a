# Correcciones de auditoría y contrato Mitoverso — 5 de noviembre de 2026

## Alcance acordado con Paco

Se preparan las correcciones 2, 3, 4, 5, 6, 8 y 9 de la auditoría. No se despliega ni se modifican datos reales en este trabajo.

- **1:** se mantiene el acceso actual por decisión de Paco. No se añade verificación obligatoria del correo.
- **7:** Paco confirma que el alta y los cobros externos se gestionan manualmente en Tadosi y después él incorpora al usuario a la plataforma. Se conservan el alta directa y los interruptores administrativos. No se consideran por sí mismos un error ni se añade una integración automática de cobro.
- **10:** se aplaza la mezcla de expedientes por correo a una reforma de cuentas familiares que permita a una cuenta gestionar varias personas, con sus nombres y plazas. No se cambia ahora el modelo `access/{uid}.studentId`.
- Se incorpora en esta intervención el contrato de Mitoverso aportado por Paco, adaptado al circuito de Mitobox y sin solicitar DNI/NIE del cliente.

Las reglas que Paco aportó después, conservadas en `referencias/firestore-aportadas-2026-11-05.rules`, son idénticas byte por byte a las reglas locales anteriores a estas correcciones. SHA-256: `BAE7623494B313F0C152878D4C115C74A612681616040F1CCF10EFB67A9E9375`. Por tanto, esa aportación confirma la referencia auditada; no elimina los casos reproducidos. La copia aportada no se usa como configuración de despliegue.

## Cambios preparados

| Punto | Cambio |
|---|---|
| 2. Contadores | Una mutación de aforo Mitobox/Gymusik exige una transición real de la reserva, comprobando el estado previo y posterior. La reserva debe corresponder al cambio de contadores. Repetir una cancelación no vuelve a liberar plazas. La capacidad inicial de un slot Mitobox se contrasta con la capacidad de sala publicada por Administración. |
| 3. Asistencia propia | Se mantiene el aviso de falta del alumno, incluida una plaza de recuperación. Solo puede modificar su entrada de una fecha; no la de compañeros. La cancelación automática de esa fecha requiere que la lista indexada completa tenga estados de ausencia. La interfaz relee la clase en transacción antes de calcularlo. No se sustituye la asistencia final del profesor ni el circuito de tickets. |
| 4. Identidad de clase | Se priorizan las rutas en origen/destino, solicitudes nuevas, bajas, cambios temporales y proyecciones. Los índices por ID no eligen arbitrariamente una clase si hay varias. La consolidación de una baja parcial conserva las otras rutas. Los registros y tickets nuevos incorporan la ruta para conciliar ausencias sin cruzar clases. Los documentos antiguos mantienen una comprobación contextual de asignatura/horario cuando falta la ruta. |
| 5. Vía antigua | Un alumno no puede crear gestiones `reserva_mitobox` ni darse a sí mismo estados resueltos o comprobaciones administrativas. Las reservas históricas solo se migran tras revisión explícita de Administración, con Mitobox activo y aforo disponible. La migración no aumenta la capacidad. En el detalle de una gestión antigua existe la acción de revisión/autorización. |
| 6. Créditos | `gymusikCreditStore.js` centraliza reserva, cancelación y preparación del saldo antiguo. Cada alumno/mes tiene un documento `gymusikCredits/{studentId}/months/{mes}`. Dos pestañas disputan el mismo documento en transacción; no pueden gastar a la vez el último crédito. Una cancelación a tiempo devuelve el crédito y una tardía lo conserva consumido; las reglas verifican también esa condición. |
| 8. Baja total | El vínculo de acceso se contrasta con el derecho vigente de la ficha. Una sesión antigua no conserva permisos de portal después de perder todas las clases y servicios. Si queda un servicio independiente, el acceso se conserva. Se cierra la vista de alumno cuando su ficha pasa a baja. |
| 9. Antelación | Mitobox compara el instante de inicio de cada hora con el reloj más 24 horas y utiliza Europe/Madrid. El selector oculta horas no válidas y la confirmación las vuelve a comprobar. Firestore también valida instante, fecha, hora, mes corriente y antelación; no basta con enviar un timestamp inventado. |

Se conserva la separación entre oferta pública de matrícula fija y aforo de recuperación por fecha. No se han cambiado las transacciones de `recoveryCapacityStore.js`, los contratos Mitobox ya aceptados ni los precios registrados de servicios antiguos. No se ha retomado el incidente histórico de una clase.

## Preparación de saldos de Gymusik

Administración prepara el saldo anterior al abrir Servicios → Gymusik. Lee del servidor las reservas del alumno y relee sus documentos dentro de una transacción. Cuenta confirmaciones, espera, asistencias, ausencias y cancelaciones que consumieron crédito. Después guarda los saldos por mes y marca `gymusikMembers/{studentId}.creditLedgerVersion = 1`.

Hasta terminar esa preparación se bloquea una primera reserva del alumno con un mensaje de sincronización; no se supone que dispone de cuatro créditos si tiene reservas antiguas. Las altas externas directas de Gymusik también preparan su saldo. Las cancelaciones administrativas y por baja eliminan las reservas correspondientes del saldo; las promociones de espera mantienen el crédito comprometido.

El nuevo saldo es operativo, no una factura ni un cobro. No consulta ni modifica Tadosi.

## Contrato Mitoverso

- Texto base: el contrato completo de 28 cláusulas aportado por Paco el 5/11/2026, en `src/components/mitoversoContractContent.js`.
- Versión inicial: `mitoverso-2026-11-05-v1`.
- Identificación como Mitobox: nombre y apellidos del contratante y del usuario, representación de menor cuando corresponda, cuenta e ID de ficha. **No hay campo de DNI/NIE del cliente.** La identidad y representación se contrastan manualmente con Tadosi/documentación del Centro.
- Se conserva el DNI del prestador que Paco ya incluyó en el contrato, distinto de pedir el documento de identidad del cliente.
- Se incorpora el domicilio del prestador ya confirmado en Mitobox: Carrer Assalt, 1 (Tarragona).
- Nuevas solicitudes: 10 €/mes con plaza de clases y 20 €/mes sin plaza, reflejados en el documento presentado y aceptado. Los servicios existentes sin tarifa registrada mantienen el valor histórico de 15 € en BI; no se recotizan ni se cambian domiciliaciones automáticamente.
- Aceptación obligatoria, inicialmente desmarcada; cambiar identidad o elección de inicio obliga a aceptar de nuevo. Se conserva texto exacto, versión, SHA-256 y recepción del servidor. Hay copia descargable antes de aceptar y desde Extras después de solicitar.
- Inicio anticipado voluntario y separado de la aceptación general. Si no se solicita, la activación respeta el plazo configurado igual que Mitobox.
- Administración puede revisar y descargar la aceptación, marcar la comprobación manual al preparar Tadosi y activar solo después de verificar evidencia, tarifa y fecha. Las solicitudes antiguas y las altas administrativas externas mantienen su circuito manual; no se fabrican contratos retroactivos.
- Se usan `mitoversoContract`, `mitoversoIdentityVerifiedAt/By` en la gestión y, tras la activación, `mitoversoMonthlyFee`, versión, huella e ID de gestión en la ficha.

## Verificación realizada

- `npm run test:static`: **221 pruebas superadas**, cero fallos.
- Reglas originales, recuperaciones y regresiones nuevas: **48 pruebas superadas** contra Firestore Emulator, proyecto ficticio `demo-escuela-seguridad`, cero fallos.
- `npm run build`: correcto. Permanece el aviso existente por tamaño de los paquetes.
- ESLint de los módulos nuevos de contrato/créditos y utilidades de servicios comprobados: sin diagnósticos. Los portales grandes conservan diagnósticos heredados; no se presenta el proyecto como un ESLint global limpio.
- No se han detectado identificadores indefinidos ni claves duplicadas en los portales comprobados.
- No se ha probado una sesión real contra Firebase, el envío de correo, una domiciliación de Tadosi ni un despliegue Vercel.

Las regresiones permanentes están en `tests/audit-regressions*.test.mjs` y `tests/mitoverso-contract.test.mjs`, incorporadas a los comandos del proyecto. Se añaden también al comando estático las pruebas de Localizador, bandeja y navegación que antes se ejecutaban aparte. Los archivos de reproducción de `auditoria/2026-11-05/` conservan la demostración histórica del defecto y no son la batería de aceptación de la versión corregida.

En este entorno se reutilizó el emulador local de la revisión, en `127.0.0.1:18285`, para ejecutar:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:18285'
node --test --test-concurrency=1 tests/firestore-rules.test.mjs tests/recovery-capacity-rules.test.mjs tests/audit-regressions-rules.test.mjs
```

Para una ejecución desde cero se puede utilizar `npm run test:security` con los puertos habituales libres, o la configuración separada `firebase.audit.local.json` mediante `firebase emulators:exec`. Los tests de regresión de permisos rechazan un host que no sea un emulador local. No usar el proyecto real como prueba.

## Publicación pendiente y compatibilidad

**No se ha publicado esta versión.** No ejecutar automáticamente estos pasos como consecuencia de leer el documento; forman parte de una futura publicación autorizada, junto a `DESPLIEGUE_SEGURO.md`.

1. Guardar las reglas actualmente publicadas y la versión Vercel anterior. Conservar los índices existentes.
2. Preparar un Preview con el frontend nuevo. Desde Administración de ese Preview, y como parte de la publicación autorizada, esperar a que se publique `roleData/studentSettings.mitoboxRoomCapacities` y abrir Servicios → Gymusik hasta preparar los miembros existentes. Esta preparación utiliza los datos reales si se hace con una cuenta real; no forma parte de las pruebas locales.
3. Publicar frontend y `firestore.rules` en una misma ventana de actualización. No hay cambios de índices ni de Storage que publicar por este bloque. No publicar Firebase Hosting.
4. Recargar las sesiones abiertas: el cliente antiguo no envía los metadatos nuevos de avisos, los saldos atómicos de Gymusik ni el instante de reserva Mitobox. No es compatible con todas las nuevas reglas. No dejar esa combinación como estado permanente ni presentar esta actualización como transparente para una pestaña antigua sin recargar.
5. Comprobar avisos propios y gestiones de recuperación, última plaza, última unidad de crédito, devolución de crédito, bajas parciales, usuario solo de servicios y solicitudes nuevas de contrato. Los pasos de correo/cobro reales requieren su autorización correspondiente; no deben utilizarse como prueba automática.
6. Si hay que volver atrás, restaurar conjuntamente reglas y frontend anteriores. Los documentos nuevos de saldo no sustituyen los registros de reservas ni borran el historial.

No hay una sincronización nueva automática de cobros ni una modificación del backend Apps Script. Su versión desplegada continúa sin contrastarse.
