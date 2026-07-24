# Integración Meta

Verificado contra documentación oficial disponible: 2026-07-23.

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

## Camino de autenticación

La primera opción es Facebook Login para administrar Page e Instagram desde una
misma app. Los permisos exactos se confirman en `P5-T01`.

Candidatos iniciales:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

La alternativa Instagram Login usa permisos `instagram_business_*`, pero tiene
capacidades diferentes. No implementar ambos caminos en la primera vertical.

Fuente:
[Instagram API oficial de Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).

## Almacenamiento de tokens

- intercambio OAuth únicamente en backend;
- secreto de app solo en servidor;
- tokens cifrados con clave separada;
- respuesta pública contiene capacidades y expiración, nunca token;
- rotación y reconexión auditadas;
- revocación invalida trabajos futuros;
- logs redactan `Authorization`, query strings sensibles y payloads.

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
