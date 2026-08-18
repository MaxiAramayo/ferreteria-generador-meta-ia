# Fase 5 — Publicación mediante Meta

## Resultado de la fase

Una persona autorizada puede conectar activos de Meta, aprobar una pieza y
publicarla en Instagram y/o Facebook de manera idempotente, auditable y
recuperable ante fallos parciales.

## Invariantes

- Solo snapshots aprobados pueden publicarse.
- Una credencial nunca llega al navegador ni a logs.
- Cada destino conserva estado y resultado independiente.
- Se fija y prueba una versión de Graph API.
- No se promete un flujo que el tipo de cuenta o permiso no soporte.

## P5-T01 — Inventariar activos, capacidades y requisitos de Meta

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: `P0-T07`, `P4-T08`
- Riesgo: Alto

### Objetivo

Confirmar cuentas, páginas, portfolio empresarial, roles, tipos de Instagram y
capacidades reales antes de diseñar OAuth o solicitar permisos.

### Entregables

- Inventario anonimizado de activos y propietarios.
- Matriz destino × formato × capacidad × permiso.
- Versión fijada de Graph API y plan de actualización.

### Criterios de aceptación

- [x] Página de Facebook e Instagram profesional están vinculados cuando se requiere.
- [x] Se identifica quién puede administrar la app y completar verificaciones.
- [x] Feed, stories y formatos inicialmente soportados están confirmados con documentación oficial.
- [x] Permisos mínimos se listan con justificación por caso de uso.
- [x] Limitaciones de cuentas, media, URLs y rate limits se documentan.
- [x] Excepción aprobada: no habrá activos Meta de prueba separados; los
  smokes no escribirán ni publicarán en los activos existentes (`ADR-019`).

### Verificación obligatoria

- [x] Revisar configuración real sin copiar tokens a documentación.
- [x] Ejecutar consulta read-only de activos con herramienta oficial o API.
- [x] Obtener aprobación del alcance inicial.

### Fuera de alcance

- Solicitar App Review.
- Publicar contenido.

### Notas de progreso

- 2026-08-12: se verificó la documentación pública oficial: Graph API vigente
  `v26.0`; el alcance inicial puede usar Instagram API con inicio de sesión con
  Facebook para empresas. Instagram feed y stories requieren cuenta profesional,
  URL pública HTTPS y, si Meta la exige, Page Publishing Authorization; las
  imágenes admitidas son JPEG y el límite informado es 100 publicaciones por
  cuenta en 24 horas. Facebook Page usa un token de Page derivado de OAuth y
  `pages_show_list`, `pages_read_engagement` y `pages_manage_posts` para el
  alcance estático. La matriz y el plan de actualización quedaron en
  [`META.md`](../integrations/META.md).
- Se intentó el inventario real desde Meta Business con una navegación de solo
  lectura. La sesión disponible no está autenticada y Chrome no está disponible;
  no se consultaron activos, no se copiaron tokens y no se modificó ninguna
  configuración. Falta que un administrador autorizado inicie sesión o habilite
  una sesión existente para ejecutar una única consulta `GET` de activos.
- 2026-08-13: se repitió el acceso de solo lectura en Meta Business. La única
  superficie disponible muestra el inicio de sesión; no había una sesión
  autorizada ni activos accesibles. No se enviaron credenciales, no se copiaron
  tokens y no se modificó configuración alguna. La página de inicio de sesión
  quedó lista para que un administrador autorizado ingrese y confirme que puede
  continuar; después corresponde consultar una sola vez los activos con `GET`.
- 2026-08-13: la sesión autenticada en Chrome confirmó la superficie conjunta
  de la Page Ferretería y Lubricentro Aramayo y el perfil
  `@ferreteria_aramayo`; Business Suite ofrece administrar la Page y editar el
  perfil de Instagram. Al abrir Settings, Meta rechazó el acceso y pidió que
  alguien con **control total** del portfolio apruebe acceso para ese perfil.
  No se envió la solicitud ofrecida, no se alteraron permisos y no se copiaron
  tokens. El vínculo operativo está confirmado, pero administradores, tipo
  Business, activos de prueba, configuración de app y autorizaciones siguen sin
  poder verificarse; el inventario parcial quedó en
  [`META.md`](../integrations/META.md).
- 2026-08-13: la sesión correcta en Chrome tiene control total del portfolio y
  permitió completar el inventario de lectura. Hay dos administradores humanos
  del portfolio y de la Page, una Page conectada explícitamente a la única
  cuenta de Instagram observada, y una aplicación de publicaciones con un
  administrador humano y un usuario de sistema. La cuenta de Instagram tiene
  una persona con acceso total y otra con acceso parcial. No se registraron
  identificadores, correos ni tokens. No se observó un par de activos de prueba
  separado ni la UI expuso el tipo Business de Instagram, el modo de la app,
  permisos aprobados o PPA. Usar los activos productivos como prueba queda
  rechazado; el detalle anonimizado está en [`META.md`](../integrations/META.md).
- 2026-08-13: el usuario decidió usar los activos existentes y no crear una
  cuenta de prueba. La excepción, sus límites y el riesgo residual están en
  [`ADR-019`](../architecture/decisions/ADR-019-EXISTING-META-ASSETS-VALIDATION.md):
  los smokes previos no escriben en Meta y toda escritura requiere autorización
  posterior y concreta. La decisión no cierra todavía la tarea: falta confirmar
  que Instagram es tipo Business e identificar al administrador humano de la
  app para App Review y verificaciones.
- 2026-08-13: el responsable del negocio confirmó que
  `@ferreteria_aramayo` es una cuenta profesional de tipo Business y que toda
  persona humana con acceso vigente a la app asume su responsabilidad operativa.
  Con esto queda confirmado el alcance inicial: Instagram feed y stories, y
  Facebook Page, usando los activos existentes bajo los límites de `ADR-019`.

### Evidencia de cierre

- Consulta autenticada de Meta Business Suite, 2026-08-13: portfolio, personas,
  Page, Instagram, vínculo entre activos y aplicación; identificadores, correos
  y tokens omitidos.
- Documentación oficial revisada el 2026-08-12 y matriz registrada en
  [`META.md`](../integrations/META.md).
- `pnpm verify:plan` en verde el 2026-08-13.
- El cierre se conserva en un commit temático de documentación y no produjo
  escrituras en Meta.

## P5-T02 — Implementar OAuth y almacenamiento de conexiones

- [ ] Tarea completada
- Estado: EN PROGRESO — IMPLEMENTACIÓN LOCAL COMPLETA; SMOKE STAGING PENDIENTE
- Dependencias: `P2-T02`, `P5-T01`
- Riesgo: Alto

### Objetivo

Conectar una cuenta de Meta mediante OAuth, descubrir activos autorizados y
almacenar tokens cifrados con ciclo de vida administrado.

### Entregables

- Inicio/callback OAuth con state y PKCE cuando aplique.
- Entidades de conexión y activo.
- Servicio de cifrado, renovación, revocación y health.

### Criterios de aceptación

- [x] `state`, redirect URI y sesión se validan en callback.
- [x] Solo un administrador puede crear o revocar conexiones.
- [x] Tokens se cifran en reposo y se descifran únicamente en backend/worker.
- [x] La UI muestra cuenta, activos, permisos y salud sin mostrar token.
- [x] Expiración, permiso revocado y activo removido tienen estados distintos.
- [x] Revocar elimina capacidad de publicar y conserva auditoría.

### Verificación obligatoria

- [ ] Flujo OAuth completo en staging.
- [x] Pruebas de state inválido, callback repetido y usuario sin permisos.
- [x] Inspeccionar BD y contratos para confirmar cifrado y redacción; el
  adaptador no registra URLs, tokens ni payloads del proveedor.

### Fuera de alcance

- Publicar una pieza.

### Notas de progreso

- Fecha: 2026-08-17.
- Estado real: dominio, contratos, migración, repositorio, cifrado AES-256-GCM,
  adaptador Graph `v26.0`, casos de uso, controlador y panel administrativo
  implementados localmente. Esa verificación no llamó a Meta ni a OpenAI.
- Restricciones conservadas: OAuth sólo para `admin`; `state` de un solo uso
  ligado a sesión/tenant; redirect fija; secretos fuera de UI, contratos y
  auditoría; revocación local fail-closed aunque la remota sea ambigua.
- Verificaciones ejecutadas: suites de dominio, API y web; `pnpm db:test`
  aplicó todas las migraciones desde cero, ejecutó repositorios, revirtió
  `20260815000000_meta_connections`, la reaplicó y terminó en verde. `pnpm
  verify` pasó build, lint, typecheck, tests, baseline y smoke completos.
- Configuración remota preparada: con autorización explícita se creó `Aramayo
  Content Staging` en el portfolio correcto, con casos de uso Instagram y Page.
  Los cinco permisos exactos de la vertical quedaron `Listo para prueba`; no se
  agregaron permisos de mensajes, comentarios, anuncios ni insights. La app
  permanece sin publicar y no se mostró ni copió el App Secret.
- El usuario autorizó continuar con hosting y DNS de staging. Una inspección
  remota de solo lectura comprobó 6,9 GiB de RAM disponible, 59 GB libres y
  cero contenedores/volúmenes. `ADR-020` habilita usar temporalmente el VPS con
  producción detenida; el perfil versionado separa proyecto Compose, dominios,
  base, Redis, volúmenes, credenciales y keyring. El worker y los proveedores
  de generación permanecen apagados durante este smoke.
- Verificación pendiente: registrar la redirect exacta y completar el OAuth en
  staging con un administrador autorizado.
- Estado operativo: las imágenes inmutables del SHA `4759c3d` se publicaron en
  GHCR mediante el workflow `32046279735` y la release remota quedó preparada.
  PostgreSQL, Redis, migración, API y web están sanos en redes privadas, sin
  puertos publicados. Caddy y worker siguen detenidos. El seed canónico y un
  administrador Argon2id auditado pasaron login y logout reales. La contraseña
  sólo existe en el Llavero local y la base conserva su hash.
- Incidente resuelto: el primer bootstrap rechazó correctamente un grupo Meta
  parcial. El perfil ahora mantiene vacíos App ID, App Secret, callback y
  versión hasta cargarlos juntos; la API reinició sana. El arreglo quedó en
  `6bfb1d9`.
- DNS/TLS completados: Donweb muestra los cuatro registros A/AAAA exactos con
  TTL 900; `ns1/ns2`, 1.1.1.1 y 8.8.8.8 devolvieron las IP correctas. Caddy es
  el único servicio que publica `80/443`, obtuvo certificados Let's Encrypt y
  web, `/health` y `/ready` respondieron `200` con TLS y headers verificados.
- 2026-08-18: el grupo Meta quedó cargado en el entorno remoto y la redirect
  exacta ya estaba registrada en `Aramayo Content Staging`, con modo estricto de
  URI y HTTPS obligatorio. La API corre con `ambiente=staging meta=habilitada`;
  PostgreSQL, Redis, Caddy y web siguen sanos y el worker detenido.
- 2026-08-18: el OAuth completo se ejecutó dos veces contra staging y quedó
  demostrado que la vertical funciona y falla cerrada. Verificado en la base:
  token cifrado AES-256-GCM con `key_version` `v1` e IV y tag en columnas
  propias, credencial de larga duración, los cinco permisos concedidos con cero
  faltantes, reconexión idempotente que subió `version` de 1 a 2 sin duplicar
  fila, health check con estados diferenciados y tres eventos de auditoría sin
  token, URL ni payload del proveedor. El panel mostró cuenta, permisos y salud
  sin exponer credenciales.
- 2026-08-18: las tres corridas terminaron en `asset_removed` con
  `assetCount: 0`. El diagnóstico descartó con evidencia que fuera el código, el
  consentimiento o el tipo de diálogo, y confirmó con un resultado positivo que
  la Page se resuelve por identificador aunque `me/accounts` la enumere vacía.
  La causa y la decisión están en
  [`ADR-021`](../architecture/decisions/ADR-021-DECLARED-META-PAGE-RESOLUTION.md).
- 2026-08-18: implementado el descubrimiento por Page declarada. Cambiaron
  `packages/configuration/src/providers.ts` —`META_PAGE_ID` entra al grupo
  atómico, que pasa de cuatro a cinco variables—, `meta-graph.port.ts` con
  `MetaAssetUnavailableError`, `facebook-graph.adapter.ts` con
  `#declaredPageAssets`, sus tests, los tres `.env.example`, el `compose.yaml`
  de producción y el ADR nuevo. `pnpm verify` pasó completo en verde.
- Verificación pendiente: repetir el OAuth en staging con el descubrimiento
  nuevo y comprobar que la conexión queda `healthy` con Page e Instagram
  poblados, sin publicar nada.
- Próximo paso exacto: reconstruir y publicar las imágenes del commit que
  contenga este cambio, desplegar staging, agregar `META_PAGE_ID` al grupo Meta
  de `/etc/aramayo-content/staging.env` —la API no arranca hasta que esté, por
  ser grupo atómico—, revocar la conexión actual y rehacer el OAuth desde el
  panel. El identificador de la Page se lee de Configuración del negocio; no se
  registra en Git.

### Evidencia de cierre

- Cierre pendiente por smoke staging. Evidencia local: migración reversible,
  pruebas de seguridad y panel sin tokens en verde el 2026-08-17.

## P5-T03 — Implementar adaptador de publicación en Instagram

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T02`
- Riesgo: Alto

### Objetivo

Crear contenedores de media, consultar procesamiento y publicar formatos
inicialmente aprobados en Instagram.

### Entregables

- Puerto y adaptador de Instagram.
- Estado de contenedor y resultado normalizado.
- Validación previa por formato.

### Criterios de aceptación

- [ ] Solo usa URLs HTTPS públicas y activos aprobados.
- [ ] Valida dimensiones, tipo y límites antes de llamar a Meta.
- [ ] Se espera el estado procesable antes de publicar.
- [ ] IDs de contenedor y publicación se guardan por intento.
- [ ] Rate limit, token, media inválida y error de procesamiento se distinguen.
- [ ] Repetir el comando no crea una segunda publicación si ya hay éxito confirmado.

### Verificación obligatoria

- [ ] Publicación real en cuenta de prueba.
- [ ] Casos de URL inaccesible, media inválida y procesamiento fallido.
- [ ] Reintento después de timeout con reconciliación por estado.

### Fuera de alcance

- Facebook y programación.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T04 — Implementar adaptador de publicación en Facebook

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T02`
- Riesgo: Alto

### Objetivo

Publicar piezas y copy en la página de Facebook manteniendo un contrato de
resultado coherente con Instagram.

### Entregables

- Puerto y adaptador de Facebook Pages.
- Validación de media/copy.
- Resultado con ID y permalink cuando esté disponible.

### Criterios de aceptación

- [ ] El destino debe pertenecer a la conexión y organización.
- [ ] Copy y media se validan antes de la llamada.
- [ ] ID remoto y respuesta segura quedan persistidos.
- [ ] Fallos se normalizan sin perder código útil de Meta.
- [ ] Reintentos usan idempotencia y reconciliación.
- [ ] Un fallo de Facebook no muta el resultado de Instagram.

### Verificación obligatoria

- [ ] Publicación real en página de prueba.
- [ ] Pruebas de permiso revocado, media inválida y timeout.
- [ ] Verificar correlación entre intento local y publicación remota.

### Fuera de alcance

- Ads Manager o promoción paga.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T05 — Orquestar publicación multidestino

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P2-T06`, `P5-T03`, `P5-T04`
- Riesgo: Alto

### Objetivo

Convertir una orden aprobada en intentos independientes por destino y calcular un
estado agregado sin ocultar fallos parciales.

### Entregables

- Caso de uso y worker de publicación.
- Modelo de orden, destino e intento.
- Máquina de estados `publishing`, `published`, `partially_published`, `publish_failed`.

### Criterios de aceptación

- [ ] La orden referencia un snapshot aprobado e inmutable.
- [ ] Cada destino tiene clave idempotente y estado propio.
- [ ] El agregado es `published` solo si todos los destinos requeridos tuvieron éxito.
- [ ] Un fallo parcial muestra qué destino falló y cuál se publicó.
- [ ] Cancelar antes del inicio evita nuevos intentos; no borra éxitos previos.
- [ ] Acciones y respuestas remotas quedan auditadas sin tokens.

### Verificación obligatoria

- [ ] E2E con éxito total, fallo total y fallo parcial.
- [ ] Requests duplicados y workers concurrentes.
- [ ] Confirmar que un snapshot no aprobado se rechaza.

### Fuera de alcance

- Reintento automático programado por horario.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T06 — Implementar reintentos y reconciliación remota

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T05`
- Riesgo: Alto

### Objetivo

Resolver respuestas ambiguas, caídas y divergencias local/remota sin duplicar
publicaciones ni declarar éxito sin evidencia.

### Entregables

- Política de retry por categoría.
- Jobs de reconciliación.
- Acciones manuales seguras.

### Criterios de aceptación

- [ ] Errores permanentes no se reintentan automáticamente.
- [ ] Timeout después de enviar consulta estado antes de volver a publicar.
- [ ] Backoff y jitter respetan límites de Meta.
- [ ] Agotar intentos genera alerta y acción manual clara.
- [ ] Reconciliación actualiza evidencia, no sobreescribe historial.
- [ ] Reintentar un solo destino no toca destinos exitosos.

### Verificación obligatoria

- [ ] Simular timeout antes y después de aceptación remota.
- [ ] Simular rate limit y token expirado.
- [ ] Ejecutar reconciliación sobre estados inconsistentes conocidos.

### Fuera de alcance

- Borrar publicaciones remotas automáticamente.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T07 — Construir UI de conexiones, aprobación y publicación

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T02`, `P5-T05`
- Riesgo: Medio

### Objetivo

Hacer visibles permisos, destinos, snapshot, riesgos y resultado antes y después
de una acción externa irreversible.

### Entregables

- Pantalla de conexiones.
- Confirmación de publicación.
- Historial e inspección por destino.

### Criterios de aceptación

- [ ] La confirmación muestra preview, cuenta, destino y copy exactos.
- [ ] No existe publicación con un clic accidental desde el editor.
- [ ] La UI impide publicar si falta aprobación o conexión sana.
- [ ] Estado parcial diferencia claramente éxito y error.
- [ ] Acciones de retry requieren rol y contexto correctos.
- [ ] Todos los controles tienen estados de carga y evitan doble envío.

### Verificación obligatoria

- [ ] E2E por rol y estado.
- [ ] Auditoría de accesibilidad.
- [ ] Prueba manual de doble clic, navegación atrás y refresh durante publicación.

### Fuera de alcance

- Calendario de contenido.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T08 — Preparar requisitos legales y App Review

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T07`
- Riesgo: Alto

### Objetivo

Completar materiales, políticas y demostraciones requeridas para operar la
integración con usuarios y activos reales.

### Entregables

- Política de privacidad, términos y eliminación de datos.
- Screencast y pasos de revisión.
- Justificación de permisos y usuario de prueba.

### Criterios de aceptación

- [ ] Las URLs legales son públicas, estables y corresponden al sistema.
- [ ] Cada permiso solicitado aparece en un flujo visible del screencast.
- [ ] El revisor puede acceder sin conocer datos internos reales.
- [ ] Eliminación y revocación tienen procedimiento probado.
- [ ] Marca, nombre y dominios de la app son consistentes.
- [ ] Solo se solicitan permisos usados por el alcance inicial.

### Verificación obligatoria

- [ ] Recorrer el guion completo como usuario de revisión.
- [ ] Probar eliminación/revocación y conservar evidencia.
- [ ] Revisión legal/administrativa antes de enviar.

### Fuera de alcance

- Garantizar aprobación de Meta.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T09 — Validar publicación real de punta a punta

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T06`, `P5-T07`, `P5-T08`
- Riesgo: Alto

### Objetivo

Demostrar en staging que una pieza generada y aprobada llega una sola vez a cada
destino previsto y que el sistema conserva evidencia completa.

### Entregables

- Escenario E2E real.
- IDs/permalinks de prueba.
- Informe de fallos, latencia y reconciliación.

### Criterios de aceptación

- [ ] La pieza proviene de un brief y snapshot aprobados.
- [ ] Se publica una vez en Instagram y Facebook de prueba.
- [ ] El copy y bitmap remotos coinciden con la confirmación.
- [ ] IDs remotos son consultables desde el historial.
- [ ] Repetir la orden no duplica contenido.
- [ ] Un fallo inducido puede reconciliarse sin alterar el destino exitoso.

### Verificación obligatoria

- [ ] Ejecutar y grabar el flujo completo.
- [ ] Verificar manualmente publicaciones remotas.
- [ ] Auditar logs, DB y almacenamiento sin secretos.

### Fuera de alcance

- Publicación automática por horario.
- Promoción paga.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## Criterios de salida de Fase 5

- [ ] `P5-T01` a `P5-T09` están completas.
- [ ] OAuth, cifrado, revocación y permisos están probados.
- [ ] Instagram y Facebook publican desde snapshots aprobados.
- [ ] Duplicados y fallos parciales están controlados.
- [ ] La revisión legal/App Review está aprobada o existe bloqueo externo documentado.
