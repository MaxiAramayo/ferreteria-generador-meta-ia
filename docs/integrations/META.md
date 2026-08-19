# Integración Meta

Verificado contra documentación oficial y configuración autenticada disponible:
2026-08-19.

## Alcance inicial

- Instagram feed.
- Instagram stories.
- Facebook Page.
- Una organización: Ferretería y Lubricentro Aramayo.

Carruseles, reels, anuncios, comentarios, mensajes e insights avanzados quedan
fuera hasta completar publicación estática.

## Descubrimiento obligatorio

Antes de implementar OAuth:

- identificar portfolio;
- identificar Page;
- confirmar Instagram profesional y tipo Business;
- confirmar vínculo Page/Instagram cuando corresponda;
- registrar administradores;
- decidir app de desarrollo y app de producción;
- revisar versión vigente de Graph API;
- confirmar dominios y URLs legales.

## Inventario autenticado de activos (2026-08-13)

La consulta de solo lectura se hizo desde una sesión con control total del
portfolio. Los identificadores, correos y tokens no se registran aquí.

| Recurso | Inventario confirmado | Estado para la integración |
|---|---|---|
| Portfolio empresarial | Un portfolio de Aramayo; dos personas con acceso total | Ambas pueden administrar los activos del portfolio. |
| Facebook Page | Una Page pública de Aramayo; dos personas con acceso total, sin socios ni accesos parciales | Es el destino Facebook productivo observado. |
| Instagram | Una cuenta `@ferreteria_aramayo`; una persona con acceso total y otra con acceso parcial de contenido, mensajes, comunidad, anuncios e insights | Está conectada a la Page. El responsable del negocio confirmó que es profesional de tipo Business. |
| Aplicación Meta | Una aplicación existente de publicaciones; una persona administradora y un usuario de sistema con acceso total | La responsabilidad operativa corresponde a toda persona humana con acceso vigente a la app; la asignación nominal permanece en el inventario privado del proveedor. |
| Activos de prueba | No se observó una Page ni una cuenta de Instagram de prueba separadas | Excepción aprobada en [`ADR-019`](../architecture/decisions/ADR-019-EXISTING-META-ASSETS-VALIDATION.md): se usarán los activos existentes, sin smoke que escriba o publique. |

La Page tiene conectada explícitamente la cuenta de Instagram inventariada. No
se hallaron socios asignados a esos activos. La pantalla de autorizaciones
mostró requisitos genéricos de verificación para anuncios; no aportó evidencia
de Page Publishing Authorization ni de aprobación para publicar por API.

Permanecen pendientes y no deben inferirse: modo y configuración de la
aplicación, permisos aprobados, Page Publishing Authorization, dominios y URLs
legales. La decisión de no separar activos y los límites de smoke están en
[`ADR-019`](../architecture/decisions/ADR-019-EXISTING-META-ASSETS-VALIDATION.md).
No se alteraron permisos, conexiones ni configuraciones, y no se copió ningún
token.

## Aplicación separada de staging (2026-08-17)

Meta for Developers confirmó que el portfolio de Aramayo no tenía una app
registrada visible; las aplicaciones que aparecían al quitar el filtro
pertenecían a otro portfolio y no se tocaron. Con autorización explícita se creó
`Aramayo Content Staging`, vinculada al portfolio de Aramayo y con los casos de
uso de administración de Instagram y Facebook Page. La app permanece **sin
publicar** y su secreto nunca se mostró ni copió.

Los cinco permisos que solicita la implementación quedaron `Listo para prueba`:
`instagram_basic`, `instagram_content_publish`, `pages_manage_posts`,
`pages_read_engagement` y `pages_show_list`. Meta agregó automáticamente
`business_management` y `public_profile` al configurar los casos de uso, pero
la plataforma no los pide en su URL OAuth. No se habilitaron mensajes,
comentarios, anuncios, insights ni otros permisos opcionales.

Sigue pendiente la callback porque todavía no existe un hostname staging real
con TLS. No se registrará el objetivo nominal de Render ni una URL productiva
como sustituto.

## Versión fijada y actualización

`P5-T01` fija Graph API `v26.0`, la versión más reciente consultada el
2026-08-12. Todas las rutas del adaptador deben incluirla explícitamente; no se
permiten llamadas sin versión. Antes de cada despliegue y, como mínimo, en cada
actualización trimestral de Graph API, se revisan changelog, fecha de retiro y
los contratos de Instagram y Pages. Un cambio de versión requiere fixtures,
smoke en cuenta de prueba y decisión registrada.

Fuentes: [versionado de Graph API](https://developers.facebook.com/docs/graph-api/guides/versioning),
[changelog](https://developers.facebook.com/docs/graph-api/changelog).

## Camino de autenticación

La primera opción confirmada es **Instagram API con inicio de sesión con
Facebook para empresas**, porque administra Page e Instagram desde una misma
app. No se implementa Instagram Login en la primera vertical.

Los permisos mínimos candidatos, que deben confirmarse contra los activos
reales antes de pedirlos, son:

- `pages_show_list`
- `instagram_basic`
- `instagram_content_publish`
- `pages_read_engagement`
- `pages_manage_posts`

`ads_management` y `ads_read` no forman parte del alcance inicial: sólo se
evalúan si el administrador asigna el rol de la app mediante Business Manager y
Meta los exige para la Page vinculada. `business_management`, mensajería, ads,
comentarios e insights avanzados no se solicitan en esta vertical.

Fuente:
[publicación de contenido de Instagram](https://developers.facebook.com/docs/instagram-platform/content-publishing/),
[API de páginas](https://developers.facebook.com/docs/pages/).

## Matriz inicial de capacidad

Esta matriz describe únicamente la documentación pública vigente; las
capacidades de los activos Aramayo quedan pendientes de la consulta autenticada
de `P5-T01`.

| Destino | Formato inicial | Capacidad y precondiciones | Permiso mínimo previsto |
|---|---|---|---|
| Instagram profesional | Feed de imagen JPEG | `POST /<IG_ID>/media` y luego `media_publish`; URL HTTPS pública; cuenta profesional vinculada a Page; PPA completada si Meta la exige | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` |
| Instagram profesional | Story de imagen JPEG | Contenedor con `media_type=STORIES`; mismos requisitos de cuenta, URL y PPA; no supone soporte de texto alternativo | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` |
| Facebook Page | Post estático | Token de Page derivado de OAuth; `POST /<PAGE_ID>/feed`; Page administrada por la conexión | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` |

Para Instagram, la guía de publicación informa un máximo de 100 publicaciones
por API por cuenta en una ventana continua de 24 horas, pero la referencia del
límite documenta hoy `quota_total` **50**. El adaptador consulta
`/<IG_ID>/content_publishing_limit` y usa lo que Meta responda; el detalle está
en [Contrato verificado de publicación](#contrato-verificado-de-publicación-2026-08-19).
Instagram admite sólo JPEG para imágenes y descarga la URL de media desde un
servidor público. La publicación de Page exige token de Page, no token expuesto
al navegador.

## Almacenamiento de tokens

- intercambio OAuth únicamente en backend;
- secreto de app solo en servidor;
- tokens cifrados con clave separada;
- respuesta pública contiene capacidades y expiración, nunca token;
- rotación y reconexión auditadas;
- revocación invalida trabajos futuros;
- logs redactan `Authorization`, query strings sensibles y payloads.

### Implementación local de `P5-T02` (2026-08-17)

La API expone las siguientes acciones, todas con sesión viva y permiso
`connections:manage`; las mutaciones además pasan CSRF y validación de origen:

| Acción | Ruta | Efecto |
|---|---|---|
| Iniciar OAuth | `POST /connections/meta/oauth` | Crea `state` aleatorio, persiste sólo su hash ligado a sesión y devuelve la URL versionada de Meta. |
| Callback | `GET /oauth/meta/callback` | Consume `state` una vez, intercambia y renueva el código, descubre cuenta y activos y redirige al panel. |
| Consultar | `GET /connections/meta` | Devuelve cuenta, permisos, activos, expiración y salud sin secretos. |
| Health | `POST /connections/meta/:id/health` | Revalida permisos y activos; distingue token vencido, permiso revocado y activo removido. |
| Renovar | `POST /connections/meta/:id/renewal` | Renueva credencial, redescubre activos y vuelve a cifrar tokens con la llave activa. |
| Revocar | `DELETE /connections/meta/:id` | Intenta revocación remota y siempre corta capacidad local mediante borrado criptográfico auditado. |

Los tokens de usuario y Page usan AES-256-GCM con IV aleatorio, tag y versión
de llave. Ni el repositorio público, ni contratos, UI o auditoría incluyen esas
columnas. El adaptador sólo llama rutas HTTPS de `graph.facebook.com` con
`v26.0`, límite de respuesta y timeout; un fallo de red no se convierte en
permiso revocado.

PKCE no se agregó al flujo web confidencial actual: el código se intercambia
exclusivamente desde la API autenticada con `app_secret`, y la documentación
aprobada de esta vertical no declaró soporte u obligación de PKCE para este
camino de Facebook Login. Si Meta lo exige en App Review, el puerto permite
incorporar `code_verifier` sin exponerlo al navegador. `state`, sesión y redirect
exacta son obligatorios independientemente de esa decisión.

La implementación local y su migración están verificadas. Sigue pendiente
configurar la redirect URI y los permisos en una app Meta separada para staging
y ejecutar un OAuth completo en ese ambiente. Esa acción externa necesita
confirmación concreta y no autoriza publicación ni creación de containers.

Antes de configurar Meta debe provisionarse el hostname staging real. El nombre
histórico de Render en `ADR-012` es sólo un objetivo y no puede registrarse como
callback mientras no resuelva, sirva TLS y ejecute esta release. Staging usa
credenciales, base, keyring y app Meta separados; la excepción de `ADR-019`
permite descubrir los activos existentes sin crear publicaciones, pero no
permite reutilizar secretos ni persistencia de producción.

## Publicación Instagram

Flujo esperado:

1. validar destino y aprobación;
2. verificar URL pública estable;
3. crear media container;
4. esperar procesamiento si aplica;
5. publicar container;
6. guardar ID externo y resultado;
7. reconciliar estado.

Meta descarga la imagen desde `image_url`, que debe ser pública:
[Create an image container](https://www.postman.com/meta/instagram/request/23987686-f4b5a72d-a125-4080-8968-93de1a549e68).

Stories requieren cuenta Business según la documentación oficial.

### Contrato verificado de publicación (2026-08-19)

Consultado en la documentación oficial vigente el 2026-08-19 e implementado en
`P5-T03`.

| Paso | Llamada | Notas |
|---|---|---|
| Crear contenedor | `POST /<IG_ID>/media` | `image_url` obligatorio; `caption` sólo en feed; `media_type=STORIES` en historia. El feed no declara `media_type`. |
| Consultar estado | `GET /<IG_CONTAINER_ID>?fields=status_code` | `EXPIRED`, `ERROR`, `FINISHED`, `IN_PROGRESS`, `PUBLISHED`. |
| Publicar | `POST /<IG_ID>/media_publish` | `creation_id` es el contenedor; devuelve el ID de la publicación. |
| Cuota | `GET /<IG_ID>/content_publishing_limit?fields=config,quota_usage` | `config.quota_total`, `config.quota_duration` y `quota_usage`. |

Especificaciones de la imagen: JPEG únicamente —`MPO` y `JPS` no—, máximo 8 MB,
proporción admitida en feed entre 4:5 y 1.91:1, ancho entre 320 y 1440 px (Meta
escala fuera de ese rango en lugar de rechazar) y color sRGB. El pie admite
2200 caracteres, 30 etiquetas y 20 menciones. Un contenedor sin publicar vence a
las 24 horas.

Dos correcciones respecto de lo registrado en `P5-T01`:

- la documentación de la cuota informa hoy `quota_total` **50** por ventana de
  86 400 segundos, no 100. El adaptador la consulta y no la fija: un número
  escrito en el código frenaría antes de tiempo o gastaría contenedores que Meta
  ya no acepta;
- las historias no publican pie. La API acepta el parámetro y lo descarta, así
  que la plataforma lo rechaza en vez de prometer un texto que nadie va a ver.

La documentación oficial no fija proporción para historias. La plataforma exige
9:16 por decisión propia: Meta recuadra o recorta cualquier otra proporción por
su cuenta y ese recorte no lo revisó nadie; el catálogo aprobado tiene un único
formato de historia y es ese. El ancho mínimo de 320 px también es regla propia,
porque una pieza escalada hacia arriba pierde la legibilidad del precio y del
llamado a la acción.

Códigos de error distinguidos por el adaptador. Los subcódigos salen de la
referencia de errores de Instagram y los códigos superiores de la guía de manejo
de errores de Graph:

| Señal de Meta | Categoría interna | ¿Reintenta? |
|---|---|---|
| `2207003`, `2207052` | `media-unreachable` | sí |
| `2207004`, `2207005`, `2207009` | `media-invalid` | no |
| `2207006` | `permission-denied` | no |
| `2207008`, `2207020` | `container-expired` | sí, con contenedor nuevo |
| `2207042` | `publishing-limit-reached` | no |
| `4`, `17`, `32`, `341`, `613`, HTTP 429 | `rate-limit` | sí |
| `102`, `190` | `token-expired` | no |
| `10`, `200`–`299`, HTTP 401/403 | `permission-denied` | no |
| HTTP 5xx o código desconocido | `provider-error` | sí sólo si es 5xx |

Fuentes:
[publicación de contenido](https://developers.facebook.com/docs/instagram-platform/content-publishing/),
[contenedor de imagen](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/),
[límite de publicación](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit/),
[códigos de error](https://developers.facebook.com/docs/instagram-api/reference/error-codes/),
[manejo de errores de Graph](https://developers.facebook.com/docs/graph-api/guides/error-handling/).

### Implementación de `P5-T03`

El puerto, las reglas y la taxonomía viven en
`packages/domain/src/instagram-publishing.ts`; el adaptador de Graph y la sonda
de la URL pública en `apps/worker/src/publishing/instagram-graph.adapter.ts`; el
publicador de un destino en
`apps/worker/src/publishing/instagram-publisher.service.ts`.

Tres decisiones que conviene conocer antes de tocarlo:

- **el token de publicación viaja en el encabezado `Authorization`**, no en la
  cadena de consulta. Publica con el token de Page, y una URL termina en
  mensajes de error y registros intermedios. El adaptador de OAuth sigue usando
  la cadena de consulta porque los extremos de intercambio de código no aceptan
  otra cosa;
- **el identificador del contenedor se guarda antes de intentar publicarlo.** Es
  el único dato que permite distinguir, después de un timeout, «no llegué a
  publicar» de «publiqué y no me enteré». Un contenedor que Meta informa como
  `PUBLISHED` sin que la plataforma tenga el ID de la publicación queda como
  intento sin confirmar y **no se vuelve a publicar**;
- **la URL se sonda antes de crear el contenedor.** La cuota se consume al crear
  el contenedor y no al publicar, así que una dirección rota descubierta por
  Meta cuesta lo mismo que una publicación. La sonda además informa el tipo y el
  peso reales de lo que se entrega, que es lo único que no puede deducirse del
  activo almacenado: el render produce PNG y quien publica tiene que entregar la
  variante `meta-feed`, que es JPEG.

## Publicación Facebook

El adaptador utilizará Pages API y una credencial con capacidad de administrar
publicaciones de la Page:
[Pages API](https://developers.facebook.com/docs/pages-api/posts/).

Los endpoints y parámetros exactos deben quedar encapsulados en el adaptador y
probados contra la versión de Graph fijada.

### Contrato verificado de publicación (2026-08-19)

Consultado en la documentación oficial vigente el 2026-08-19 e implementado en
`P5-T04`.

| Paso | Llamada | Notas |
|---|---|---|
| Preparar la foto | `POST /<PAGE_ID>/photos` con `published=false` | Deja la foto en estado temporal 24 horas. Nadie la ve. Devuelve `id`. |
| Publicar | `POST /<PAGE_ID>/feed` | `message` con el copy y `attached_media=[{"media_fbid":"<id>"}]`. Devuelve `id`. |
| Reconciliar | `GET /<PHOTO_ID>?fields=page_story_id` | Presente prueba que la publicación existe. **Ausente no prueba lo contrario.** |
| Enlace | `GET /<POST_ID>?fields=permalink_url` | Lectura opcional de presentación. |

Especificaciones de la imagen: JPEG, BMP, PNG, GIF y TIFF; máximo **4 MB** —la
mitad que Instagram—; Meta recomienda mantener los PNG por debajo de 1 MB para
que no se pixelen y elimina por su cuenta los metadatos de ubicación. No hay
restricción documentada de proporción. La longitud del copy no está documentada
para publicaciones de Page; la plataforma adopta el mismo tope de 2200
caracteres que Instagram para que una misma pieza no se acepte en un destino y
se rechace en el otro.

**Por qué dos llamadas y no una.** Facebook admite publicar la foto y su texto
en una sola llamada. Esta vertical usa dos por idempotencia: con una sola, una
respuesta perdida deja a la plataforma sin ningún identificador que consultar, y
las dos salidas automáticas —publicar de nuevo o abandonar— son igual de malas.
Subir la foto sin publicar primero produce un identificador que se guarda antes
de pedir la publicación, y ese identificador sí puede responder después la única
pregunta que importa.

**La respuesta es concluyente en un solo sentido.** Si `page_story_id` está, la
publicación existe. Si no está, la documentación advierte que «puede no estar en
todas las fotos», así que su ausencia no prueba que no se publicó. Por eso una
publicación ambigua —timeout o 5xx después de tener la foto preparada— queda en
`outcome_unknown` y **no se reintenta sola**: espera decisión humana. Publicar en
la Page de un negocio real es irreversible y elegir automáticamente entre
duplicar y no publicar no es una decisión del worker. Un rechazo explícito
—permiso, credencial, pieza inválida— no creó nada, así que sí se marca fallido y
su reintento es seguro.

Códigos distinguidos por el adaptador. La Page informa sus fallos con los
códigos generales de Graph y no con la familia `22070xx` de Instagram:

| Señal de Meta | Categoría interna | ¿Reintenta? |
|---|---|---|
| `4`, `17`, `32`, `341`, `613`, HTTP 429 | `rate-limit` | sí |
| `102`, `190` | `token-expired` | no |
| `10`, `200`–`299`, HTTP 401/403 | `permission-denied` | no |
| `324`, `1363030`, `1363037` | `media-invalid` | no |
| `100` sobre la foto preparada | `staged-media-expired` | sí, preparando otra |
| `1`, `2` | `provider-error` | sí |
| HTTP 5xx o código desconocido | `provider-error` | sí sólo si es 5xx |

Fuentes:
[publicaciones de Page](https://developers.facebook.com/docs/pages-api/posts/),
[fotos de Page](https://developers.facebook.com/docs/graph-api/reference/page/photos/),
[feed de Page](https://developers.facebook.com/docs/graph-api/reference/page/feed/),
[nodo Photo](https://developers.facebook.com/docs/graph-api/reference/photo/),
[manejo de errores de Graph](https://developers.facebook.com/docs/graph-api/guides/error-handling/).

### Implementación de `P5-T04`

Las reglas y el puerto están en `packages/domain/src/facebook-publishing.ts`; el
adaptador en `apps/worker/src/publishing/facebook-graph.adapter.ts`; el
publicador en `facebook-publisher.service.ts`.

`P5-T04` unificó además el vocabulario de intentos de los dos destinos en
`packages/domain/src/meta-publishing-attempt.ts`: un único diario, una única
taxonomía de fallos y un único conjunto de estados. La razón es concreta:
`P5-T05` calcula un estado agregado sobre destinos distintos, y si cada uno
tuviera su vocabulario ese cálculo tendría que traducir antes de comparar, que
es justamente donde se pierde la diferencia entre «falló» y «no sé si salió».

Los destinos siguen siendo independientes: cada uno tiene su propia fila,
identificada por su `publicationTargetId`. Un fallo en Facebook no puede tocar el
resultado de Instagram porque no comparten estado, sólo contrato.

## Idempotencia y fallas

- Un `PublicationTarget` tiene una clave única.
- Antes de llamar a Meta se adquiere un lock de negocio.
- Se almacena request ID y respuesta normalizada.
- Un 429 o 5xx usa backoff limitado.
- Un error de permisos o media inválida no se reintenta sin corrección.
- Un destino exitoso no se repite.
- Si el resultado remoto es ambiguo, ejecutar reconciliación antes de reintentar.

## App Review y producción

La salida a producción requiere, según corresponda:

- app configurada para negocio;
- permisos aprobados;
- activos asignados;
- política de privacidad;
- endpoint de eliminación de datos;
- dominios verificados;
- screencast y pasos reproducibles;
- usuario de revisión o flujo accesible;
- pruebas en una Page/cuenta controlada.

No habilitar publicación automática mientras la app esté en modo de prueba.
