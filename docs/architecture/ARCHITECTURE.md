# Arquitectura

## Contexto

La plataforma combina una UI interactiva, un backend de negocio, trabajos
largos y tres clases de fuentes externas:

- OpenAI para interpretación, recuperación y recursos visuales;
- Meta para publicaciones;
- sistema comercial para información vigente.

Las acciones externas tienen costo y efectos visibles. Por eso no se ejecutan
directamente desde componentes de UI ni dentro del mismo request HTTP que las
solicita.

## Forma inicial

Monorepo TypeScript con:

- `apps/web`: panel Next.js;
- `apps/api`: monolito modular NestJS;
- `apps/worker`: proceso NestJS standalone con colas;
- `packages/configuration`: validación y contratos de entorno por proceso;
- `packages/domain`: reglas puras;
- `packages/contracts`: contratos compartidos;
- `packages/process-health`: sondas de infraestructura y readiness compartidas;
- `packages/design-engine`: render visual;
- `infrastructure/database`: schema, migraciones, cliente Prisma generado y
  adaptadores de repositorio;
- PostgreSQL: fuente de verdad;
- Redis/BullMQ: transporte de trabajos;
- Cloudinary: media pública y derivaciones.

El piloto productivo se empaqueta para un VPS dedicado con Docker Compose.
Caddy termina TLS y es el único servicio con puertos publicados; API, worker,
PostgreSQL y Redis comparten una red interna. La decisión, límites y
consecuencias operativas están en
[ADR-013](decisions/ADR-013-DEDICATED-VPS-DEPLOYMENT.md).

## Módulos del backend

- `identity`: autenticación y roles.
- `organizations`: Aramayo, marcas, locales y políticas.
- `knowledge`: documentos, aprobación y sincronización.
- `catalog`: acceso de solo lectura a productos, precio y stock.
- `content`: briefs, captions y piezas.
- `media`: activos originales y derivados.
- `generation`: OpenAI y trazabilidad de ejecuciones.
- `rendering`: motor visual y verificación.
- `connections`: credenciales y estado de proveedores.
- `publishing`: publicación por destino.
- `scheduling`: calendario y recurrencia.
- `audit`: eventos de seguridad y negocio.

Los módulos exponen servicios mínimos. No se permiten dependencias circulares.
Los proveedores externos implementan puertos del dominio mediante tokens de
inyección.

Prisma queda confinado a `infrastructure/database`. Los repositorios convierten
filas a tipos de `packages/domain`; ni los casos de uso ni los contratos
públicos reciben tipos generados por el ORM.

El módulo `content` expone la vertical síncrona de borradores:

- `POST /publications` crea publicación y primera revisión;
- `GET /publications` lista con paginación y filtros de estado o ubicación;
- `GET /publications/:publicationId` recupera la revisión vigente;
- `GET /publications/:publicationId/revisions` consulta historial paginado;
- `PATCH /publications/:publicationId` agrega una revisión con
  `expectedVersion`.
- `POST /publications/:publicationId/render` confirma intención y transición a
  `generating_assets` junto con auditoría, idempotencia y outbox;
- `POST /publications/:publicationId/approve` crea el snapshot inmutable y
  confirma la transición a `approved` en una sola transacción.

Las rutas reciben únicamente identificadores de medios; el caso de uso resuelve
URLs y metadatos controlados dentro del tenant. Ninguna ruta de borradores
programa ni publica contenido. Solicitar render es una acción separada y
explícita; sólo esa ruta crea la intención que consume el worker.

El módulo `connections` implementa OAuth Meta como una vertical separada. El
inicio autenticado crea un `state` de diez minutos ligado a organización,
membresía y sesión; el callback sólo consume su hash una vez y usa la redirect
URI de configuración, nunca una recibida del cliente. El adaptador versionado
intercambia y renueva la credencial, descubre permisos, Page e Instagram y
entrega datos tipados al caso de uso. Cifrado, persistencia y auditoría ocurren
antes de responder; el contrato público proyecta salud y activos sin secretos.
Health, renovación y revocación son acciones administrativas diferentes.

## Arranque y salud de los procesos

Cada proceso convierte su entorno en un contrato tipado antes de aceptar trabajo:

1. `apps/api` y `apps/worker` ejecutan el parser de `@aramayo/configuration`
   como primera operación de `main.ts`. Un `ConfigurationError` termina el
   proceso con código 1 antes de `listen()` o de registrar consumidores.
2. `apps/web` valida el contrato público en el hook `register` de
   `instrumentation.ts`; si es inválido, el servidor no sirve contenido.

La API expone dos endpoints con responsabilidades distintas:

- `GET /health` es liveness: responde 200 mientras el proceso esté vivo y no
  consulta dependencias.
- `GET /ready` es readiness: consulta PostgreSQL y Redis y responde 503 cuando
  alguna no está disponible.

El worker no expone HTTP: reporta el mismo estado en su log al arrancar y en
cada latido. Su consumidor reclama mensajes outbox con lease; actualmente sólo
el tópico de render tiene un transporte configurado y los demás fallan de forma
explícita. Ambos procesos comparten las sondas de
`packages/process-health` ([ADR-010](decisions/ADR-010-PROCESS-HEALTH-BOUNDARY.md))
y cierran de forma ordenada mediante los hooks de apagado de NestJS.

## Flujos largos

IA, render y publicación se modelan como trabajos:

1. API valida autorización e intención.
2. API crea registro de negocio y evento transaccional.
3. Dispatcher encola trabajo idempotente.
4. Worker reclama y actualiza estado.
5. Worker ejecuta proveedor externo.
6. Worker persiste resultado y auditoría.
7. UI consulta o recibe actualización.

La cola puede reconstruirse desde PostgreSQL. Un trabajo desaparecido de Redis
no puede perder una publicación programada.

Para programaciones, `dispatch_requested_at` y `dispatch_outbox_event_id`
registran que una ocurrencia ya produjo intención de transporte; no afirman que
ya exista una orden. El repositorio escribe esas marcas y el outbox en una sola
transacción después de reclamar con `FOR UPDATE SKIP LOCKED`. BullMQ deduplica
por UUID de ocurrencia y el worker vuelve a asegurar periódicamente todos los
jobs cuyas ocurrencias sigan `planned`. `P6-T03` es quien convierte ese job en
orden y recién entonces fija `dispatched_at`.

El render usa un `mediaAssetId` UUID determinista derivado de la revisión. Si el
PNG se confirmó pero el worker perdió el lease, el mismo evento reconoce esa
salida y termina sin renderizar ni cargar otra vez. Éxito y fallo actualizan la
máquina de estados y su auditoría; una imagen que no decodifica nunca produce un
fallback.

## Ciclo de medios

El worker es el único proceso que recibe credenciales Cloudinary. La inspección
con Sharp deriva tipo, dimensiones y SHA-256 desde bytes decodificados antes de
reservar almacenamiento. El caso de uso separa los efectos para hacer visibles
los fallos parciales:

1. validar bytes, nombre, tipo y límites;
2. reservar `MediaAsset` dentro del tenant;
3. subir con `public_id` determinista y `overwrite: false`;
4. comprobar clave, versión, URL HTTPS y metadatos devueltos;
5. confirmar `available` en PostgreSQL.

Las variantes de entrega se construyen con clave y versión persistidas; el
documento de diseño admite la URL HTTPS remota, pero nunca credenciales ni una
ruta local arbitraria. El borrado marca primero `pending_deletion`, comprueba
referencias y retención dentro de una transacción, elimina en Cloudinary y sólo
entonces confirma `deleted`. Una respuesta remota ambigua conserva el estado
reintentable.

La retención se asigna al reservar: originales y derivados preparados toman la
política de su organización; bases y composiciones generadas reciben la ventana
de huérfanos. El worker ejecuta un barrido horario, acotado y no superpuesto,
que consulta únicamente vencidos sin referencias. Crear un adjunto, render,
base o composición bloquea la fila del medio y exige `available`, por lo que se
serializa contra `beginDeletion` en PostgreSQL.

Una edición visual recupera la base generada de la variante elegida mediante
`MediaStorage.read()`. El worker no confía sólo en la URL remota: vuelve a
decodificar los bytes y exige coincidencia de tipo, tamaño, dimensiones y
SHA-256 con PostgreSQL antes de usar la imagen como referencia de Images.

## Recuperación de conocimiento

La recuperación documental combina dos controles independientes. PostgreSQL
selecciona primero las versiones activas, aprobadas, vigentes y permitidas para
la organización y sucursal derivadas de la sesión. File Search busca únicamente
entre sus hashes y el worker vuelve a validar cada resultado contra esa lista
local antes de construir contexto.

`KnowledgeRetrievalRepository` resuelve elegibilidad y
`KnowledgeSearchPort` aísla la búsqueda remota. El caso de uso limita fuentes,
fragmentos y tamaño total, conserva documento, versión y fragmento exacto, y
devuelve `missing_information` cuando no existe evidencia suficiente o hay
fuentes conflictivas. Un fallo del proveedor es un error operativo explícito,
no ausencia de información.

## Herramientas comerciales

El worker expone cinco definiciones estrictas y estables para buscar productos,
obtener una ficha, consultar precio, consultar stock y verificar una recepción.
Los esquemas no contienen organización ni sucursal: ambos valores, junto con la
membresía del actor, provienen del contexto autenticado que crea la sesión de
herramientas.

`CommercialToolExecutionService` valida argumentos, tenant y mapping de
sucursal antes de alcanzar `CommercialCatalogPort`. El adaptador productivo usa
exclusivamente `GET` contra la API HTTPS dedicada de Odoo, rechaza redirects,
campos inesperados y respuestas mayores a 64 KiB. La salida para OpenAI queda
limitada a 10 productos y 12.000 caracteres.

Cada ejecución conserva una cuota máxima por run y timeout. Éxito, rechazo y
fallo se escriben en `audit_events` con actor, herramienta, duración, resultado
y parámetros minimizados; ni el token, ni el texto buscado, ni el payload
comercial completo se auditan. Si la auditoría falla, el resultado no se
entrega.

## Perfiles visuales

Pedir una imagen no es redactar texto libre en cada ejecución. Un perfil
versionado traduce el lenguaje visual aprobado a parámetros verificables
—formato, intención, estilo, foco, espacio reservado, restricciones y guía
negativa— y la dirección visual del brief junto con la marca determinan cuál
corresponde.

`@aramayo/domain` es la autoridad: define los perfiles, sanea las variables de
origen no confiable y decide entre generar o resolver con render determinista.
El worker aporta el catálogo, el texto versionado de las instrucciones y la
política de activos. El motor de diseño sigue siendo la única fuente de
dimensiones: el espacio reservado viaja al prompt con la zona segura real del
formato.

Tres límites gobiernan el prompt. El texto comercial no se delega a la imagen
—precio, promoción, horario, CTA y logo se componen después—; ninguna marca se
genera, así que un producto de marca llega como foto real y sólo un artículo
genérico puede dibujarse; y lo que escribió una persona entra como dato dentro de
una sección declarada no confiable, nunca concatenado en las instrucciones. Cada
plan conserva perfil, versión y hash, y el fallback determinista distingue por
qué no hubo generación.

## Gobernanza de generación

La admisión y el costo siguen
[`ADR-015`](decisions/ADR-015-GENERATION-GOVERNANCE.md). La API reserva el
primer intento de todas las variantes en la misma transacción que crea el lote
y su outbox. El worker consulta la política vigente antes de generar y cada
retry entra nuevamente por el ledger. La configuración del proveedor es una
condición adicional: una política habilitada no inventa una credencial ausente.

El ledger persiste `reserved`, `in_flight`, `settled`, `unconfirmed` y
`released`. Reservas activas, costo liquidado y costo no confirmado forman el
gasto comprometido. Esta separación conserva el costo aunque fallen moderación,
almacenamiento o composición, y permite liberar en una cancelación sólo los
intentos que nunca alcanzaron al proveedor.

## Genealogía editorial de generación

La edición y selección siguen
[`ADR-016`](decisions/ADR-016-GENERATION-EDIT-LINEAGE.md). Una edición crea un
`GenerationRun` hijo con raíz, ejecución padre, variante padre, clase e
instrucción explícitas; nunca sobrescribe el lote anterior. Los cambios
visuales conservan el brief y usan Images con la composición verificada como
referencia. Los factuales exigen primero otro `ContentBriefRun` generado y
posterior, de modo que precio, producto o promoción vuelven a pasar por la
frontera de evidencia.

La variante elegida es un puntero versionado en el lote. Seleccionar usa
idempotencia, auditoría y compare-and-swap, conserva todas las variantes y no
implica aprobación ni publicación.

## Frontend

El compositor se diseña por composición:

```text
PublicationComposer.Provider
  PublicationComposer.ContextPanel
  PublicationComposer.Request
  PublicationComposer.Facts
  PublicationComposer.Preview
  PublicationComposer.Actions
```

Variantes explícitas:

- `TemplatePublicationComposer`
- `AICreativeComposer`
- `RecurringStoryComposer`
- `ProductPromotionComposer`

`AICreativeComposer` delega las variantes a un workspace cohesivo. La UI hace
visibles como acciones distintas generar, cambiar imagen, cambiar datos o
producto, comparar y seleccionar. El estado compara hasta dos resultados con
su versión de prompt, perfil, costo y hash; una variante fallida muestra el
motivo y no renderiza acciones no disponibles.

El provider es el único que conoce persistencia y sincronización. Los
subcomponentes consumen una interfaz con `state`, `actions` y `meta`.
La variante de creatividad asistida presenta el texto propuesto y las fuentes
verificadas en regiones separadas; una cita nunca se renderiza como parte del
texto generado.

## Fuente de verdad

- Estados y calendario: PostgreSQL.
- Datos comerciales: sistema comercial; la plataforma guarda snapshots.
- Conocimiento editorial: documentos aprobados y versionados.
- Archivos: Cloudinary; la base guarda metadatos y relaciones.
- Trabajo en tránsito: Redis/BullMQ.
- Código de marca y formatos: `design-engine`.

## Límites

No forma parte del primer publicador:

- CRM completo;
- inbox omnicanal;
- anuncios pagos;
- escritura en el sistema comercial;
- respuesta automática a clientes;
- publicación automática desde órdenes no recibidas.
