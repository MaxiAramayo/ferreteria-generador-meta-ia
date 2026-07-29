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

Las rutas reciben únicamente identificadores de medios; el caso de uso resuelve
URLs y metadatos controlados dentro del tenant. Ninguna ruta de borradores
encola, programa ni publica contenido.

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
cada latido, sin ejecutar trabajo simulado. Ambos comparten las sondas de
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

El provider es el único que conoce persistencia y sincronización. Los
subcomponentes consumen una interfaz con `state`, `actions` y `meta`.

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
