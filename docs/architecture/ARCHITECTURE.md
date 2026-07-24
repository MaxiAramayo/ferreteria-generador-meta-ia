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
- `packages/design-engine`: render visual;
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
