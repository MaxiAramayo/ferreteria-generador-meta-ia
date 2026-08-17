# Integración Meta

Verificado contra documentación oficial y configuración autenticada disponible:
2026-08-17.

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

Para Instagram, Meta informa un máximo de 100 publicaciones por API por cuenta
en una ventana continua de 24 horas; el adaptador debe consultar
`/<IG_ID>/content_publishing_limit` y conservar límites locales más estrictos.
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

## Publicación Facebook

El adaptador utilizará Pages API y una credencial con capacidad de administrar
publicaciones de la Page:
[Pages API](https://developers.facebook.com/docs/pages-api/posts/).

Los endpoints y parámetros exactos deben quedar encapsulados en el adaptador y
probados contra la versión de Graph fijada.

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
