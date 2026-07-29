# Database

PostgreSQL es la fuente de verdad de publicaciones, revisiones, aprobaciones,
medios y ownership. Este workspace contiene el límite de infraestructura
aprobado en `ADR-006`: Prisma no entra en `packages/domain` ni en contratos
públicos; los casos de uso reciben repositorios tipados.

## Modelo entidad-relación inicial

```mermaid
erDiagram
  ORGANIZATION ||--o{ ORGANIZATION_MEMBERSHIP : owns
  USER ||--o{ ORGANIZATION_MEMBERSHIP : joins
  USER ||--o{ AUTHENTICATION_SESSION : authenticates
  ORGANIZATION_MEMBERSHIP ||--o{ AUTHENTICATION_SESSION : scopes
  ORGANIZATION ||--o{ AUTHENTICATION_EVENT : audits
  ORGANIZATION ||--o{ BRAND : owns
  BRAND ||--o{ LOCATION : configures
  ORGANIZATION ||--o{ ORGANIZATION_CONFIGURATION_EVENT : audits
  ORGANIZATION_MEMBERSHIP ||--o{ ORGANIZATION_CONFIGURATION_EVENT : authors
  ORGANIZATION_MEMBERSHIP ||--o{ PUBLICATION : creates
  LOCATION o|--o{ PUBLICATION : scopes
  PUBLICATION ||--o{ PUBLICATION_REVISION : versions
  ORGANIZATION_MEMBERSHIP ||--o{ PUBLICATION_REVISION : authors
  PUBLICATION_REVISION ||--o| APPROVAL_SNAPSHOT : freezes
  ORGANIZATION_MEMBERSHIP ||--o{ MEDIA_ASSET : owns
  PUBLICATION_REVISION ||--o{ PUBLICATION_REVISION_MEDIA : uses
  MEDIA_ASSET ||--o{ PUBLICATION_REVISION_MEDIA : references
```

`Organization` es la raíz de tenant. `User` es una identidad global y sólo
adquiere acceso mediante `OrganizationMembership`; por eso esas dos tablas son
las únicas que no llevan `organization_id`. Toda relación entre filas de
negocio usa una clave compuesta que incluye `organization_id`: conocer un UUID
válido de otra organización no alcanza para relacionarlo ni recuperarlo.

## Invariantes persistidas

- Los estados son enums de PostgreSQL alineados con `packages/domain`.
- Los listados críticos tienen índices por organización + estado y por
  organización + fecha programada.
- Todas las relaciones de negocio usan `ON DELETE RESTRICT`; no existe una
  cascada que borre historial o medios de manera implícita.
- Una revisión numera sus versiones dentro de una publicación, exige
  `content_hash` SHA-256 y es append-only. Sólo su estado puede avanzar; el
  contenido, diseño, autor, numeración y referencias a medios no se actualizan
  ni eliminan.
- Crear o editar un borrador valida autor, ubicación y medios con
  `organization_id`, bloquea la publicación para comparar `expectedVersion` y
  confirma publicación, revisión y referencias en una sola transacción.
- Los listados de publicaciones y revisiones paginan y filtran en PostgreSQL;
  una revisión vinculada a `approval_snapshots` conserva esa identificación en
  el historial.
- Un medio `available` exige hash, MIME, tamaño, versión, clave y URL HTTPS.
- El ciclo de medios conserva errores como par código/mensaje únicamente en
  `failed`, dimensiones en todo activo `available` y fecha de borrado únicamente
  en `deleted`. La migración retroactiva deriva esa fecha de `updated_at` para
  filas históricas ya eliminadas.
- Reservar y confirmar medios usa filtros por organización y estado. La
  eliminación se bloquea si existe cualquier `publication_revision_media` o si
  `retention_until` sigue vigente; luego progresa
  `available -> pending_deletion -> deleted`.
- La decisión de borrar bloquea la fila del activo. El trigger
  `publication_revision_media_requires_available` toma un lock compatible y
  rechaza adjuntar medios fuera de `available`; una carrera entre adjuntar y
  borrar queda serializada sin ventana de referencia huérfana.
- Una fila de `approval_snapshots` es append-only mediante trigger y guarda el
  documento completo —contenido, diseño, marca y metadatos de medios—. Sus
  claves foráneas conservan linaje, pero no hacen falta para reconstruir la
  pieza aprobada.
- Una transición actualiza estado y versión mediante compare-and-swap y agrega
  una fila append-only a `publication_state_transitions` dentro de la misma
  transacción. Fallos actuales conservan código, mensaje seguro, reintento y
  timestamp.
- Organización, marca y ubicación conservan versiones para compare-and-swap.
  Una actualización de identidad comercial cambia organización y marca dentro
  de una única transacción; una carrera revierte ambas escrituras.
- `organization_configuration_events` conserva actor, objetivo y documentos
  `before`/`after` dentro de la misma transacción que la mutación. Un trigger
  impide actualizar o eliminar su historial.
- Las credenciales locales son opcionales y consistentes: hash, versión y fecha
  de cambio existen juntas o son nulas juntas. El seed no crea una contraseña.
- Una sesión referencia usuario, membresía y organización mediante ownership
  compuesto. Sólo persiste hashes de sesión y CSRF; vencimiento y revocación
  tienen constraints e índices propios.
- Los eventos de autenticación son append-only. Un cambio de roles queda
  limitado por organización y una revocación de membresía revoca sus sesiones
  dentro de la misma transacción.
- La lectura de sesión consulta roles y estados vigentes. También rechaza una
  sesión creada antes de `password_changed_at`.

## Comandos

```bash
pnpm db:generate
pnpm db:migrate:dev --name nombre
pnpm db:migrate:deploy
pnpm db:seed
pnpm db:test
```

Prisma 7 toma el schema, las migraciones y el seed desde
[`../../prisma.config.ts`](../../prisma.config.ts). El cliente se genera dentro
de `src/generated/` durante build y no se versiona.

`pnpm db:test` crea una base efímera en el PostgreSQL local, aplica la historia
desde cero, ejecuta el seed y las pruebas con dos organizaciones, revisa los
planes de consultas, ejecuta el `down.sql` de la última migración y vuelve a
aplicarla. La base efímera se elimina incluso ante fallo.

Prisma Migrate no ejecuta migraciones descendentes automáticamente. Cada
migración reversible conserva un `down.sql` revisado; usarlo fuera de la prueba
requiere el procedimiento operativo, respaldo y autorización correspondientes.
Nunca se usa `db push` en ambientes compartidos.

El seed es idempotente y exclusivamente de desarrollo: crea Aramayo, una
identidad `.invalid` sin credencial, una membresía con todos los roles para
pruebas, la marca y dos ubicaciones desde `@aramayo/brand-knowledge`. No asigna
responsables reales ni habilita un acceso por defecto.

La instancia local y sus procedimientos están documentados en
[`../local/README.md`](../local/README.md). PostgreSQL `17.9` queda fijado;
cambiar de major exige repetir migraciones, rollback, backup y restauración.
