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

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Flujo OAuth completo en staging.
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

- OAuth completo en staging el 2026-08-18 con las imágenes del SHA
  `45a2f272af609b19ccf17b2a8d02aab77a223db0`. El evento
  `meta.connection.connected` quedó auditado con
  `{"health": "healthy", "assetCount": 2, "permissionCount": 6}`, sin token, URL
  ni payload del proveedor.
- Base de staging después del cierre: una única conexión —sin duplicar tras
  cinco versiones—, dos activos `active`, credencial de usuario cifrada en 282
  caracteres base64url con `access_key_version` `v1`, y token de Page cifrado
  aparte. La cuenta de Instagram no guarda token propio porque publica con el de
  la Page. Tres transacciones OAuth consumidas, ninguna reutilizable.
- Panel en staging: la conexión muestra `LISTA PARA PUBLICAR`, distintivo
  `HABILITADA`, Instagram Business `@ferreteria_aramayo` y la Facebook Page como
  activos, seis permisos con cero faltantes y ningún token.
- El defecto de descubrimiento encontrado en el camino, su diagnóstico y la
  decisión están en
  [`ADR-021`](../architecture/decisions/ADR-021-DECLARED-META-PAGE-RESOLUTION.md).
  El arreglo entró por [PR #5](https://github.com/MaxiAramayo/ferreteria-generador-meta-ia/pull/5)
  con CI en verde y `pnpm verify` completo.
- Migración reversible, pruebas de seguridad y panel sin tokens en verde desde
  el 2026-08-17; `pnpm verify` volvió a pasar completo el 2026-08-18.
- Desviación registrada: el token renovado volvió sin `expires_in`, así que la
  conexión quedó sin vencimiento. El dominio ya modela `expiresAt` como opcional
  y la salud omite el chequeo cuando no existe, pero conviene tenerlo presente
  al implementar renovación programada en `P5-T06`.

## P5-T03 — Implementar adaptador de publicación en Instagram

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Solo usa URLs HTTPS públicas y activos aprobados.
- [x] Valida dimensiones, tipo y límites antes de llamar a Meta.
- [x] Se espera el estado procesable antes de publicar.
- [x] IDs de contenedor y publicación se guardan por intento.
- [x] Rate limit, token, media inválida y error de procesamiento se distinguen.
- [x] Repetir el comando no crea una segunda publicación si ya hay éxito confirmado.

### Verificación obligatoria

- [x] Publicación real en cuenta de prueba. Se ejecutó en la cuenta real bajo la
  enmienda de `ADR-019`: no existen activos de prueba separados.
- [x] Casos de URL inaccesible, media inválida y procesamiento fallido.
- [x] Reintento después de timeout con reconciliación por estado.

### Fuera de alcance

- Facebook y programación.

### Notas de progreso

- Fecha: 2026-08-19.
- Estado real: puerto, reglas, adaptador de Graph, sonda de la URL pública y
  publicador de un destino implementados y verificados localmente. Ninguna
  verificación llamó a Meta.
- Archivos: `packages/domain/src/instagram-publishing.ts` con su prueba y su
  export en `index.ts`; `apps/worker/src/publishing/instagram-graph.adapter.ts`,
  `instagram-publisher.service.ts`, `in-memory-instagram-attempts.ts` y las dos
  pruebas del worker; `docs/integrations/META.md` con el contrato verificado.
- Contrato revisado contra la documentación oficial el 2026-08-19 y registrado
  en [`META.md`](../integrations/META.md). Aparecieron dos correcciones a lo
  asumido en `P5-T01`: la cuota documentada bajó de 100 a `quota_total` 50 —el
  adaptador la consulta y no la fija—, y las historias no publican pie, así que
  un pie en ese destino se rechaza en vez de enviarse para que Meta lo descarte.
- Decisiones de la implementación: el token de publicación viaja en el
  encabezado `Authorization` y no en la cadena de consulta; el identificador del
  contenedor se guarda antes de intentar publicar; la URL se sonda con `HEAD`
  —o un `GET` de un byte— antes de crear el contenedor, porque la cuota se
  consume al crearlo y no al publicarlo.
- Reglas propias, no de Meta, marcadas como tales en el código: una historia
  exige 9:16 porque Meta recorta cualquier otra proporción por su cuenta y ese
  recorte no lo revisó nadie, y el ancho mínimo es 320 px porque una pieza
  escalada hacia arriba pierde la legibilidad del precio y del CTA.
- Consecuencia registrada para `P5-T05`: **el render produce PNG y Instagram
  sólo admite JPEG**. Quien publique tiene que entregar la variante `meta-feed`
  de `MediaStorage.deliveryUrl`, que ya reconvierte a JPEG y limita el lado
  largo a 1440 px. Las medidas que recibe el publicador describen lo que entrega
  esa variante, no lo que guarda el activo: una historia de 1080×1920 se entrega
  como 810×1440 y conserva la proporción.
- Seam declarado: el diario de intentos es un puerto
  (`InstagramAttemptJournal`) y hoy sólo existe su doble en memoria, que aplica
  la misma regla de secuencia que tendrá la tabla. Persistirlo es el entregable
  «modelo de orden, destino e intento» de `P5-T05`; recuperar el identificador
  de una publicación que Meta confirmó sin devolverlo es de `P5-T06`. El
  publicador no se conecta a ningún módulo Nest todavía, a propósito: cablearlo
  sin persistencia real sería un agujero de corrección.
- Verificaciones ejecutadas: 55 pruebas nuevas —17 de dominio, 18 del adaptador
  y 20 del publicador— y `pnpm verify` completo en verde, con `verify:stack`,
  `verify:plan`, `format:check`, `build`, `lint`, `typecheck`, `test`,
  `baseline:verify` y `smoke`.
- Riesgo residual conocido: si el diario falla justo después de crear el
  contenedor, ese identificador se pierde y el reintento crea otro. Es
  inherente —un diario que no escribe tampoco puede registrar nada— y se acota
  cuando `P5-T05` lo persista dentro de la transacción del outbox. Perder la
  escritura *después* de publicar sí es recuperable: quien ganó la carrera
  conserva el contenedor y Meta lo informa `PUBLISHED`, así que ese trabajador
  termina en «publicado sin confirmar» en vez de publicar otra vez.
- Verificación pendiente y bloqueo: **la publicación real no se ejecutó.**
  `ADR-019` no autoriza escribir en los activos existentes y no hay activos de
  prueba separados. Una publicación, aunque sea de prueba, necesita
  autorización posterior y concreta del usuario con activo, media, copy, destino
  y efecto esperado. Mientras tanto la tarea queda `[ ]`.
- 2026-08-19: el usuario autorizó la publicación real y se ejecutó. La tarea
  queda cerrada; el detalle está en la evidencia de cierre.
- Incidente durante la corrida, que vale registrar porque es exactamente el
  fallo que el diseño previene: la primera corrida creó el contenedor de
  Instagram y **falló al escribir el diario** por permisos del volumen. El
  identificador del contenedor se perdió y ese contenedor quedó huérfano hasta
  vencer a las 24 horas. No se publicó nada —`media_publish` nunca se llamó— y
  la corrida siguiente creó uno nuevo. Costó una unidad de la cuota diaria de
  50. Confirma por qué el diario tiene que escribir antes de publicar: si el
  fallo hubiera ocurrido un paso más tarde, no habría forma de saber si la
  publicación existía.
- Dos huecos de infraestructura que aparecieron y que `P5-T05` hereda: la red
  `backend` del stack es `internal: true` —llega a PostgreSQL pero no a
  internet—, así que el worker que publique necesita salida; y las variables de
  Cloudinary estaban vacías en el entorno de staging, sin las cuales no hay
  dónde alojar la pieza.

### Evidencia de cierre

- Publicación real en `@ferreteria_aramayo` el 2026-08-19, con las imágenes del
  SHA `c8cb89636deb20b275fec255b72baa330e90ae69` construidas en el VPS de
  staging. Contenedor `17875714101627070`, publicación `17868397647637585`.
- Lectura remota posterior con `GET /{media-id}`: HTTP 200, `media_type` `IMAGE`
  y `caption` idéntico carácter por carácter al confirmado antes de publicar.
- Idempotencia probada contra la cuenta real: repetir el comando exacto devolvió
  `already-published` con el mismo identificador y **sin crear una segunda
  publicación**.
- Pieza entregada por la variante `meta-feed` de Cloudinary staging: PNG de
  1122×1402 —proporción 0,8003, dentro del rango 4:5 a 1.91:1 por 0,0003—
  convertido a JPEG de 0,16 MB. SHA-256 del original
  `1dce89f86f31d614829affaffb5d18a9ad2c1609277668db6a879c7a4a1ba58c`.
- La autorización, sus términos y las dos desviaciones que implica están en la
  enmienda 2026-08-19 de
  [`ADR-019`](../architecture/decisions/ADR-019-EXISTING-META-ASSETS-VALIDATION.md).
- 96 pruebas de la vertical y `pnpm verify` completo en verde.

## P5-T04 — Implementar adaptador de publicación en Facebook

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] El destino debe pertenecer a la conexión y organización.
- [x] Copy y media se validan antes de la llamada.
- [x] ID remoto y respuesta segura quedan persistidos.
- [x] Fallos se normalizan sin perder código útil de Meta.
- [x] Reintentos usan idempotencia y reconciliación.
- [x] Un fallo de Facebook no muta el resultado de Instagram.

### Verificación obligatoria

- [x] Publicación real en página de prueba. Se ejecutó en la Page real bajo la
  enmienda de `ADR-019`: no existen activos de prueba separados.
- [x] Pruebas de permiso revocado, media inválida y timeout.
- [x] Verificar correlación entre intento local y publicación remota.

### Fuera de alcance

- Ads Manager o promoción paga.

### Notas de progreso

- Fecha: 2026-08-19.
- Estado real: reglas, puerto, adaptador de Graph y publicador implementados y
  verificados localmente. Ninguna verificación llamó a Meta.
- Archivos: `packages/domain/src/facebook-publishing.ts` y
  `meta-publishing-attempt.ts` con sus pruebas y sus exports en `index.ts`;
  `apps/worker/src/publishing/facebook-graph.adapter.ts`,
  `facebook-publisher.service.ts` y las dos pruebas del worker;
  `docs/integrations/META.md` con el contrato verificado.
- **Decisión de diseño principal: la publicación usa dos llamadas y no una.**
  Facebook admite publicar la foto con su texto de una sola vez, pero entonces
  una respuesta perdida deja a la plataforma sin ningún identificador que
  consultar, y las dos salidas automáticas —publicar de nuevo o abandonar— son
  igual de malas. Subir la foto con `published=false` primero produce un
  identificador que se guarda antes de pedir la publicación, y ese identificador
  responde después, vía `page_story_id`, si la publicación existe.
- **Esa respuesta es concluyente en un solo sentido.** Presente prueba que la
  publicación existe; ausente no prueba lo contrario, porque Meta documenta que
  el campo puede faltar. Por eso un fallo ambiguo con foto ya preparada queda en
  `outcome_unknown` y **no se reintenta solo**: publicar en la Page de un
  negocio real es irreversible y esa elección no le corresponde al worker. Un
  rechazo explícito sí se marca fallido, porque no creó nada.
- Subtarea de alcance, justificada por el objetivo «contrato de resultado
  coherente con Instagram»: el vocabulario de intentos se unificó en
  `meta-publishing-attempt.ts` —un diario, una taxonomía de fallos, un conjunto
  de estados— y `P5-T03` se refactorizó sobre él. `P5-T05` calcula un estado
  agregado sobre destinos distintos; con dos vocabularios tendría que traducir
  antes de comparar, que es donde se pierde la diferencia entre «falló» y «no sé
  si salió». Los destinos siguen independientes: cada uno tiene su fila propia,
  identificada por su `publicationTargetId`.
- Diferencias reales con Instagram que la implementación respeta: la Page pesa
  **4 MB** como máximo —la mitad—, acepta cinco formatos de imagen, no impone
  proporción y **exige texto**, porque una publicación de Page sin copy pierde
  el mensaje, el dato verificado y el llamado a la acción.
- Verificaciones ejecutadas: 96 pruebas en total sobre la vertical de
  publicación —41 nuevas de Facebook y del módulo compartido— y `pnpm verify`
  completo en verde.
- Defecto encontrado y corregido en la propia revisión: el enlace permanente se
  perdía al guardar el intento porque la forma del cambio repetía los campos del
  registro en vez de derivarlos. Se derivó el tipo con `Omit` para que no vuelva
  a pasar, y quedó cubierto por prueba.
- Verificación pendiente y bloqueo: **la publicación real no se ejecutó.** Es el
  mismo bloqueo que `P5-T03`: `ADR-019` no autoriza escribir en los activos
  existentes y no hay Page de prueba separada. Mientras tanto la tarea queda
  `[ ]`.
- Próximo paso exacto: obtener autorización explícita y concreta y ejecutar una
  única publicación en la Page desde staging, registrando identificador de foto
  preparada, identificador de publicación y enlace permanente.

### Evidencia de cierre

- Publicación real en la Page de Aramayo el 2026-08-19, con las imágenes del SHA
  `c8cb89636deb20b275fec255b72baa330e90ae69`. Foto preparada
  `1587397383077625`, publicación `252222471780140_1587397416410955`, enlace
  `https://www.facebook.com/1587397443077619/posts/1587397416410955`.
- Correlación intento ↔ publicación remota comprobada: los identificadores del
  diario coinciden con los que devolvió `GET /{post-id}` —HTTP 200,
  `created_time` `2026-08-19T21:57:11+0000`— y el `message` remoto es idéntico
  al confirmado antes de publicar.
- Idempotencia probada contra la Page real: repetir el comando exacto devolvió
  `already-published` con el mismo identificador y enlace, leídos del registro y
  sin volver a llamar a Meta.
- Independencia de destinos comprobada en la misma corrida: Instagram y Facebook
  escribieron filas distintas del diario, cada una con su clave de destino.
- La autorización y sus desviaciones están en la enmienda 2026-08-19 de
  [`ADR-019`](../architecture/decisions/ADR-019-EXISTING-META-ASSETS-VALIDATION.md).

## P5-T05 — Orquestar publicación multidestino

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] La orden referencia un snapshot aprobado e inmutable.
- [x] Cada destino tiene clave idempotente y estado propio.
- [x] El agregado es `published` solo si todos los destinos requeridos tuvieron éxito.
- [x] Un fallo parcial muestra qué destino falló y cuál se publicó.
- [x] Cancelar antes del inicio evita nuevos intentos; no borra éxitos previos.
- [x] Acciones y respuestas remotas quedan auditadas sin tokens.

### Verificación obligatoria

- [x] E2E con éxito total, fallo total y fallo parcial.
- [x] Requests duplicados y workers concurrentes.
- [x] Confirmar que un snapshot no aprobado se rechaza.

### Fuera de alcance

- Reintento automático programado por horario.

### Notas de progreso

- Fecha: 2026-08-19.
- Estado real: dominio, persistencia, orquestación, API y cableado del worker
  implementados y verificados con dobles. Falta la verificación contra
  PostgreSQL real.
- Archivos: `packages/domain/src/publication-publishing.ts` con su prueba;
  `infrastructure/database/prisma/schema.prisma` y la migración
  `20260819230000_publication_orders`;
  `infrastructure/database/src/publication-order-repository.ts`;
  `apps/api/src/content/publication-order.{service,controller}.ts`, su DTO y su
  prueba; `apps/worker/src/publishing/publication-order.transport.ts`,
  `meta-credential.adapter.ts` y `publishing.module.ts` con sus pruebas;
  contratos públicos en `packages/contracts/src/publication-draft.ts`.
- **El estado agregado se calcula, no se guarda.** Un campo puede quedar
  diciendo `published` sobre una orden cuyo destino falló; una función pura de
  los estados por destino no. Su regla central es negativa: `published` exige
  que **todos** los destinos requeridos hayan salido.
- **`outcome_unknown` deja la orden abierta a propósito.** Un destino ambiguo no
  es éxito ni fallo, así que la orden se queda en `publishing`: cerrarla exigiría
  elegir entre duplicar y abandonar. El detalle por destino muestra cuál está en
  duda.
- **La regla de secuencia vive en el `WHERE` del `UPDATE`.** La decide el motor y
  no la aplicación: dos trabajadores sobre el mismo destino compiten en la base y
  gana exactamente uno.
- **El repositorio implementa dos contratos sobre las mismas dos tablas** —ciclo
  de la orden y diario de intentos—, porque separarlos obligaría a mantener el
  estado del intento sincronizado en dos lugares.
- **Lo que se publica sale del snapshot, no del borrador**, y el checksum del
  activo almacenado se compara contra el que el snapshot fijó: una pieza
  cambiada aborta en vez de publicar algo que nadie revisó.
- Los publicadores quedaron cableados al worker. Hasta ahora estaban sueltos a
  propósito: sin diario persistente, un publicador conectado podía duplicar tras
  un reinicio.
- Defecto encontrado y corregido en la propia revisión: Nest inyecta por
  posición, y con dos grupos opcionales —brief y publicación— un brief
  deshabilitado con publicación habilitada habría entregado el transporte de
  publicación en el parámetro del brief. El token de publicación se provee
  siempre, con `null` cuando Meta falta.
- Verificaciones ejecutadas: 29 pruebas nuevas —11 del agregado, 9 de la
  orquestación y 9 de la API— y `pnpm verify` completo en verde.
- Fecha: 2026-08-20. La verificación contra PostgreSQL real quedó hecha y
  cerró los dos criterios que faltaban.
- **La corrida contra PostgreSQL encontró dos defectos que los dobles no podían
  encontrar, y los dos estaban en el repositorio, no en las pruebas.** Ninguno
  se veía compilando: `pnpm verify` estaba en verde con los dos presentes.
- **Defecto 1: `request()` nunca pudo crear una orden.** El `create` anidado de
  los destinos pasaba `organizationId` explícito, y Prisma lo deriva de la clave
  foránea compuesta de la orden padre; como argumento desconocido, la creación
  fallaba entera. TypeScript no lo vio porque el literal viaja como tipo de
  retorno inferido de un `map`, donde no corre el chequeo de propiedades
  excedentes. Sin base real, ninguna prueba lo podía tocar.
- **Defecto 2: la transición de estado violaba un CHECK anterior.**
  `state_transitions_approval_check` reserva `approval_snapshot_id` al comando
  `approve`, y las dos transiciones `advance` de la orden —pedido y cierre— lo
  escribían. `publication-production-repository.ts` ya lo hacía bien; la orden
  era la excepción. Se quitó la columna de ambas: la orden guarda a qué snapshot
  apunta, así que no se pierde trazabilidad.
- **La migración no tenía `down.sql`.** Se escribió, y con ella el ciclo revertir
  y reaplicar corre completo. Revierte los dos ENUM además de las dos tablas:
  un tipo que sobrevive a su tabla hace fallar la reaplicación con «type already
  exists», y esa falla sólo aparece al reaplicar, no al revertir.
- `verify.ts` apuntaba a `20260815000000_meta_connections` como última
  migración. Ahora apunta a la de órdenes, y sus aserciones de reversión se
  dieron vuelta: Meta ya no es la última, así que tiene que sobrevivir.
- Detalle que costó una corrida: PostgreSQL ordena un ENUM por el orden de
  declaración de sus valores, no alfabéticamente. `instagram_feed` va antes que
  `facebook_page` al ordenar por `target`.
- Verificaciones ejecutadas: 8 pruebas de integración nuevas contra PostgreSQL
  real —éxito total, fallo total, fallo parcial, destino en duda, pedidos
  duplicados concurrentes, dos trabajadores sobre el mismo destino, cancelación
  y rechazo de estados imposibles—, `pnpm db:test` completo y `pnpm verify`
  completo, los dos en verde.

### Evidencia de cierre

- `pnpm db:test` en verde el 2026-08-20: migración aplicada desde una base
  vacía, seed verificado, 31 pruebas de integración en verde, migración
  revertida con `down.sql` y reaplicada con las pruebas repetidas.
- `pnpm verify` completo en verde: formato, build, lint, typecheck, pruebas,
  línea base de diseño y smoke de `api`, `web` y `worker`.
- Las pruebas que cierran los criterios abiertos viven en
  `infrastructure/database/src/repositories.integration.test.ts`: «la orden E2E
  publica todos sus destinos y cierra como published», «…cierra como
  publish_failed», «…cierra como partially_published», «dos pedidos duplicados
  de publicación crean una sola orden» y «dos trabajadores sobre el mismo
  destino publican una sola vez».
- Queda en pie una molestia de entorno ajena a la tarea: `pnpm infra:up` y el
  resto de los comandos `infra:*` rechazan el `.env` local por dos claves en
  minúscula —`correo` y `password`, líneas 45 y 46—, porque
  `tools/local-infrastructure/environment.ts` exige `^[A-Z][A-Z0-9_]*$`. No se
  tocaron por parecer credenciales personales. La verificación se corrió
  levantando los contenedores con el mismo `docker compose` que `infra:up`
  ejecuta, cuyo parser sí las acepta; `pnpm db:test` no las mira porque usa
  `parseEnv` de Node.

## P5-T06 — Implementar reintentos y reconciliación remota

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Errores permanentes no se reintentan automáticamente.
- [x] Timeout después de enviar consulta estado antes de volver a publicar.
- [x] Backoff y jitter respetan límites de Meta.
- [x] Agotar intentos genera alerta y acción manual clara.
- [x] Reconciliación actualiza evidencia, no sobreescribe historial.
- [x] Reintentar un solo destino no toca destinos exitosos.

### Verificación obligatoria

- [x] Simular timeout antes y después de aceptación remota.
- [x] Simular rate limit y token expirado.
- [x] Ejecutar reconciliación sobre estados inconsistentes conocidos.

### Fuera de alcance

- Borrar publicaciones remotas automáticamente.

### Notas de progreso

- Fecha: 2026-08-20.
- Estado real: política, persistencia y los dos barridos implementados y
  verificados con dobles; la persistencia además contra PostgreSQL real.
  **Falta cablearlos al worker, despachar los reintentos vencidos y ofrecer las
  acciones manuales.** La tarea sigue `[ ]`.
- Archivos: `packages/domain/src/publication-retry.ts` con su prueba;
  la migración `20260820120000_publication_retry_schedule`;
  `infrastructure/database/src/publication-order-repository.ts`;
  `apps/worker/src/publishing/publication-retry.service.ts`,
  `publication-reconciliation.service.ts` y
  `meta-publication-lookup.adapter.ts`, cada uno con su prueba.
- **Un fallo se resuelve en tres salidas y no en un booleano.** `scheduled` para
  lo que cambia solo, `manual` para lo que no cambia esperando y `reconcile`
  para los dos casos en que la publicación puede existir sin que la plataforma
  lo sepa. El `retryable` que traen los adaptadores contesta otra pregunta —si
  conviene repetir la llamada en el acto—, y confundir las dos es lo que
  duplica.
- **La tabla de salidas es un `Record` completo a propósito.** Un `default`
  silencioso habría mandado a reintento automático los códigos que nadie
  clasificó.
- **El planificador está separado del publicador**, y es lo que hace que la
  política sobreviva a un reinicio: el publicador registra el fallo y ahí
  termina su corrida, así que un plan que viviera dentro de ella se perdería con
  la caída. El barrido vuelve a encontrar los fallos que nadie planificó.
- **La reconciliación no publica.** Todas sus llamadas son lecturas, así que
  correrla de más no puede duplicar; lo peor que pasa es gastar cuota. El paso
  que decide si hay que publicar de nuevo tiene que ser incapaz de publicar.
- **Las dos redes obligan a reglas asimétricas.** La Page nunca prueba una
  ausencia —`page_story_id` ausente es desconocimiento, no negativa—, así que un
  destino de Facebook en duda sólo puede confirmarse, jamás republicarse solo.
  El contenedor de Instagram sí prueba las dos cosas, pero cuando prueba que
  salió no devuelve la media: por eso existe `published-unidentified`, y
  tratarlo como ausencia republicaría algo ya publicado.
- **Reconciliar no borra el fallo.** El destino falló de verdad y después se
  comprobó que había salido; las dos cosas son ciertas.
- Dos `CHECK` nuevos: un destino no puede esperar el reintento y esperar a una
  persona al mismo tiempo, y un destino publicado no puede esperar nada. El
  segundo es lo que impide que un barrido vuelva a tocar lo que ya salió.
- Verificaciones ejecutadas: 39 pruebas nuevas —18 de la política, 7 de
  persistencia contra PostgreSQL real, 6 de planificación, 6 de reconciliación y
  7 de traducción—, `pnpm verify` y `pnpm db:test` completos en verde.
- Fecha: 2026-08-20. Los barridos quedaron corriendo, el despacho escrito y las
  acciones manuales expuestas. La tarea cierra.
- **Cablear los reintentos obligó a corregir un defecto de `P5-T05`.** La orden
  se cerraba como `publish_failed` en el mismo instante en que el planificador
  iba a programarle un reintento, así que ningún reintento habría corrido nunca.
  `failed` no alcanza para dar por cerrado un destino: la pregunta correcta no
  es «¿está fallido?» sino «¿queda algo que el sistema vaya a hacer solo?». Un
  fallo cuenta como resuelto sólo cuando la política ya no se va a ocupar de él
  —causa permanente, intentos agotados o motivo manual registrado— y uno ambiguo
  nunca, porque espera a que la reconciliación pregunte.
- **`pendingPublicationTargets` dejó de devolver los destinos caídos.** Un fallo
  vuelve a la cola sólo cuando el calendario lo pone en `pending`, en su fecha.
  Dejarlo adentro habría hecho que cualquier reentrega del evento reintentara al
  instante todos los destinos caídos, tirando el backoff recién calculado.
- **El despacho es transaccional.** Devolver el destino a `pending` y reencolar
  el evento van juntos: un destino sin evento espera para siempre y un evento
  sin destino habilitado no hace nada. Una orden cancelada o cerrada no recibe
  nada.
- **El barrido corre planificar, reconciliar y despachar en ese orden**, y no es
  casual: un destino que la consulta acaba de confirmar deja de tener reintento
  pendiente antes de que el despacho lo mire.
- **La alerta se expone, no se emite.** Un destino detenido que nadie mira es un
  fallo silencioso, y una notificación que nadie recibe también. El servidor
  decide qué acciones son seguras y las vuelve a comprobar contra el motivo
  guardado al ejecutar: un panel con una lista vieja no alcanza para forzar un
  reintento sobre un desenlace en duda.
- **Abandonar no reescribe el intento.** Un destino en duda queda en duda y así
  se guarda; lo único que cambia es que la plataforma deja de intentar y la
  orden puede cerrar. Cerrarla afirmando un fallo que nadie comprobó sería la
  mentira que el resto del modelo evita.
- Dos defectos propios corregidos contra PostgreSQL real: una lista de motivos
  mantenida a mano en el repositorio se desincronizó del dominio y dejaba las
  órdenes abandonadas sin cerrar nunca —ahora se deriva de una sola lista—, y un
  `NOT` de Prisma sobre una columna nullable descartaba las filas con nulo por la
  lógica ternaria de SQL, que eran justamente los destinos que nadie había
  tocado.
- Nota de cableado: `PublicationMaintenanceService` no lleva `@Injectable()`. El
  módulo lo provee con `useFactory`, así que Nest nunca resuelve sus parámetros
  por metadatos, y el decorador además impediría probarlo porque el borrado de
  tipos de Node no admite decoradores.

### Evidencia de cierre

- `pnpm verify` y `pnpm db:test` completos en verde el 2026-08-20, con la
  migración `20260820120000_publication_retry_schedule` aplicada desde una base
  vacía, revertida con su `down.sql` y reaplicada.
- 78 pruebas nuevas: 21 de la política y la reconciliación en el dominio, 6 más
  del agregado en `publication-publishing.test.ts`, 26 de los servicios del
  worker —9 de planificación y despacho, 6 de reconciliación, 7 de traducción de
  respuestas de Meta y 4 del orden del barrido—, 7 de la API de acciones
  manuales y 14 de integración contra PostgreSQL real.
- Las pruebas que cierran cada verificación: «un timeout después de que Meta
  aceptó se cierra con la evidencia remota» y «un timeout antes de que Meta
  aceptara devuelve el destino a la cola» para el desenlace ambiguo; «un límite
  de Meta se reintenta después de su ventana» y «un token vencido no se
  reintenta: se reconecta» para los dos fallos del criterio; y «la reconciliación
  arregla un destino fallido que en Meta sí salió» para el estado inconsistente
  conocido.

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

- [x] La confirmación muestra preview, cuenta, destino y copy exactos.
- [x] No existe publicación con un clic accidental desde el editor.
- [x] La UI impide publicar si falta aprobación o conexión sana.
- [x] Estado parcial diferencia claramente éxito y error.
- [x] Acciones de retry requieren rol y contexto correctos.
- [x] Todos los controles tienen estados de carga y evitan doble envío.

### Verificación obligatoria

- [ ] E2E por rol y estado.
- [x] Auditoría de accesibilidad.
- [ ] Prueba manual de doble clic, navegación atrás y refresh durante publicación.

### Fuera de alcance

- Calendario de contenido.

### Notas de progreso

- Fecha: 2026-08-20.
- Estado real: los seis criterios de aceptación cumplidos y la auditoría de
  accesibilidad cerrada con la herramienta del proyecto. **Falta el E2E de
  navegador**; la tarea sigue `[ ]`.
- Archivos: `apps/web/lib/publication-publishing-presentation.ts` y
  `publication-publishing-api.ts` con sus pruebas;
  `apps/web/app/publicaciones/publish-confirmation.tsx`,
  `publication-order-panel.tsx` y `publication-target-result.tsx`;
  `apps/web/app/diseno/publicacion/page.tsx`; `GET publications/:id/orders` en
  `apps/api/src/content/publication-order.{service,controller}.ts`.
- **La decisión de si el botón existe vive en funciones puras, no en el JSX.**
  Una regla escondida en un `&&` no se puede probar y termina siendo distinta de
  la del servidor. El orden de las preguntas de la puerta es deliberado: el rol
  primero, porque quien no puede publicar no necesita enterarse del estado de la
  conexión ni de la pieza.
- **Los destinos salen de los activos de la conexión, no de una lista fija.**
  Prometer Instagram cuando sólo hay una Page hace que el problema aparezca
  después de confirmar algo irreversible.
- **El copy y la pieza salen de la revisión aprobada, no de la última.** Mostrar
  un borrador más nuevo haría que la confirmación describiera algo distinto de
  lo que sale.
- **Doble defensa contra el doble envío, y protegen cosas distintas.** El botón
  deshabilitado y el guard del manejador defienden la experiencia; la clave
  idempotente defiende el dato. Un reintento después de un rechazo conserva la
  clave del intento anterior: si el primer pedido llegó y lo que se perdió fue
  la respuesta, el segundo devuelve la orden original en vez de crear otra.
- **Un pedido sin respuesta queda indeterminado, no fallido.** Puede haber
  salido, y afirmar un fallo sería inventar un desenlace con una acción
  irreversible atrás.
- **El resultado por destino distingue cuatro desenlaces y no dos**, y no sólo
  por color: la etiqueta los nombra. La duda se ve distinta del error porque un
  fallo se reintenta y una duda no.
- **`/diseno/publicacion` existe porque esos estados casi nunca se pueden
  mirar.** Aparecen después de una publicación que salió mal, y para entonces
  nadie está revisando accesibilidad. Para auditarlos, el resultado por destino
  se separó en un componente que sólo recibe props: lo que se audita es el
  marcado real y no una copia.
- La auditoría encontró una sección sin nombre accesible **y también en el
  workspace de publicaciones**, donde nunca se había detectado porque esa
  pantalla exige sesión y el auditor no llega. Y se quitó un `role="dialog"` que
  prometía foco atrapado y cierre con Escape sin cumplirlos; la confirmación
  recibe el foco al abrirse, que es lo que hacía falta de verdad.
- Verificaciones ejecutadas: 23 pruebas del panel —incluida la matriz de cinco
  roles por nueve estados—, `pnpm design:review --harness` sin hallazgos en
  `/diseno/publicacion`, y `pnpm verify` completo en verde.
- **Lo que falta y por qué:** el E2E de navegador y la prueba manual de
  navegación atrás y refresh durante una publicación necesitan la vertical
  entera levantada con datos sembrados —base efímera migrada, usuarios por rol,
  una conexión Meta sana con sus tokens cifrados y una pieza aprobada con PNG—.
  `playwright-core` ya está en el catálogo y `tools/design-review` muestra cómo
  se lanza Chrome, así que no hace falta cambiar el stack; falta el arnés que
  arme ese entorno. Es un entregable propio y conviene tratarlo como tal.
- El doble clic sí quedó verificado, pero en la máquina de estados del envío y
  no en el navegador.

### Evidencia de cierre

- Pendiente: falta el E2E de navegador por rol y estado, y con él la prueba de
  navegación atrás y refresh durante una publicación.

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
