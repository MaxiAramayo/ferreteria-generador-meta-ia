# Infraestructura local

Esta definición inicia PostgreSQL y Redis exclusivamente para desarrollo. Usa el
proyecto Compose fijo `aramayo-content-platform-local`; sus contenedores, red y
volúmenes no se comparten con otros proyectos.

## Requisitos

- Docker Engine con Compose v2.
- Node y pnpm fijados en [`../../docs/architecture/STACK.md`](../../docs/architecture/STACK.md).

## Configuración inicial

```bash
cp .env.example .env
```

Completar en `.env` valores locales no vacíos para `POSTGRES_PASSWORD` y
`REDIS_PASSWORD`. Los identificadores y puertos pueden modificarse sin editar
archivos versionados:

- `POSTGRES_USER`;
- `POSTGRES_DB`;
- `POSTGRES_PORT`;
- `REDIS_PORT`.

`.env` está ignorado por Git. No reutilizar credenciales reales ni de ambientes
remotos.

## Comandos

```bash
pnpm infra:config
pnpm infra:up
pnpm infra:health
pnpm infra:restart
pnpm infra:down
```

`infra:up` valida la configuración, inicia ambos servicios, espera sus
healthchecks y comprueba conexiones autenticadas desde un proceso Node local.
`infra:down` elimina contenedores y red, pero conserva los volúmenes.

## Limpieza destructiva

La limpieza elimina contenedores, red y volúmenes pertenecientes únicamente al
proyecto Compose fijo. Requiere una confirmación literal:

```bash
pnpm infra:clean --confirm aramayo-content-platform-local
```

Sin esa confirmación el comando falla antes de invocar Docker. Después de
limpiar, el próximo `infra:up` crea una base y una instancia Redis vacías.

## Persistencia y exposición

- PostgreSQL guarda datos en `postgres_data`.
- Redis usa AOF en `redis_data` para comodidad local, aunque continúa siendo
  estado descartable y no canónico.
- Ambos puertos se publican únicamente en `127.0.0.1`.
- PostgreSQL exige SCRAM para conexiones TCP.
- Redis exige contraseña para healthcheck y clientes.

Las imágenes oficiales están fijadas por versión, base Alpine y digest:

- PostgreSQL `17.9-alpine3.23`;
- Redis `8.2.7-alpine3.22`.

Versiones y tags verificados el 2026-07-24 contra la
[imagen oficial de PostgreSQL](https://hub.docker.com/_/postgres) y las
[notas oficiales de Redis 8.2](https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/release-notes/redisce/redisos-8.2-release-notes/).
Redis 8.2 se mantiene en su línea GA soportada y `8.2.7` incluye las correcciones
publicadas hasta junio de 2026.

## Diagnóstico

`pnpm infra:health` no imprime URLs ni credenciales. Ante un fallo:

1. ejecutar `docker compose --project-name aramayo-content-platform-local
   --env-file .env --file infrastructure/local/compose.yaml ps`;
2. revisar logs del servicio afectado sin compartir valores de `.env`;
3. usar `pnpm infra:restart`;
4. preservar volúmenes hasta entender el fallo.

No usar `infra:clean` como primer intento de recuperación.
