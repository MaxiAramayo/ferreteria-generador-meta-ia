# Configuración de procesos

## Objetivo

Cada proceso convierte `process.env` en un contrato tipado antes de aceptar
tráfico o trabajos. Ningún módulo de negocio debe leer variables de entorno en
forma directa.

El paquete [`@aramayo/configuration`](../../packages/configuration/) expone
entradas separadas:

- `@aramayo/configuration/web`;
- `@aramayo/configuration/api`;
- `@aramayo/configuration/worker`.

`P0-T05` debe invocar el parser correspondiente como primera operación del
bootstrap. Un `ConfigurationError` termina el proceso con código distinto de
cero antes de `listen()` o de iniciar consumidores BullMQ.

## Invariantes

- Los errores contienen nombres de variables y códigos, nunca valores.
- Sólo `NEXT_PUBLIC_API_BASE_URL` puede entrar al contrato del navegador.
- Los secretos se representan como `SecretValue`; serializarlos produce
  `[REDACTED]` y obtener el texto requiere una llamada explícita a `reveal()`.
- API y worker comparten nombres de variables, no objetos de configuración.
- Staging y producción requieren HTTPS para orígenes y callbacks.
- OpenAI, Cloudinary y Meta pueden estar deshabilitados, pero una integración
  parcialmente configurada es inválida.
- La primera entrada de `TOKEN_ENCRYPTION_KEYS` es la llave activa de escritura.

## Matriz por proceso

| Variable | Web | API | Worker | Condición |
|---|---:|---:|---:|---|
| `NODE_ENV` | Sí | Sí | Sí | Siempre |
| `APP_TIMEZONE` | Sí | Sí | Sí | Siempre; zona IANA |
| `NEXT_PUBLIC_API_BASE_URL` | Sí, pública | No | No | Siempre |
| `PORT` | No | Sí | No | Siempre; Render puede inyectarla |
| `WEB_ORIGIN` | No | Sí | No | Siempre; origen sin path |
| `WORKER_CONCURRENCY` | No | No | Sí | Siempre; entero entre 1 y 64 |
| `DATABASE_URL` | No | Sí | Sí | Siempre; privada |
| `REDIS_URL` | No | Sí | Sí | Siempre; privada |
| `TOKEN_ENCRYPTION_KEYS` | No | Sí | Sí | Siempre; privada |
| `OPENAI_API_KEY` | No | No | Sí | Grupo OpenAI habilitado |
| `OPENAI_PROJECT_ID` | No | No | Sí | Grupo OpenAI habilitado |
| `OPENAI_VECTOR_STORE_ID` | No | No | Sí | Opcional aun con OpenAI habilitado |
| `CLOUDINARY_CLOUD_NAME` | No | No | Sí | Grupo Cloudinary habilitado |
| `CLOUDINARY_API_KEY` | No | No | Sí | Grupo Cloudinary habilitado |
| `CLOUDINARY_API_SECRET` | No | No | Sí | Grupo Cloudinary habilitado |
| `CLOUDINARY_FOLDER` | No | No | Sí | Grupo Cloudinary habilitado |
| `META_APP_ID` | No | Sí | Sí | Grupo Meta habilitado |
| `META_APP_SECRET` | No | Sí | Sí | Grupo Meta habilitado |
| `META_REDIRECT_URI` | No | Sí | Sí | Grupo Meta habilitado |
| `META_GRAPH_API_VERSION` | No | Sí | Sí | Grupo Meta habilitado |

`META_PAGE_ID` e `META_INSTAGRAM_ACCOUNT_ID` no son configuración global. Son
destinos vinculados a una organización y se persistirán en `connections` con
ownership y auditoría.

## Variables exclusivas de infraestructura local

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`,
`REDIS_PASSWORD` y `REDIS_PORT` son consumidas por Docker Compose y los comandos
`infra:*`. Las aplicaciones reciben únicamente `DATABASE_URL` y `REDIS_URL`.

## Matriz por ambiente

| Ambiente | Fuente | Separación y reglas |
|---|---|---|
| Desarrollo | `.env` local ignorado por Git | Credenciales exclusivas de desarrollo; proveedores ausentes por defecto |
| Test | Variables inyectadas por el runner | Placeholders deterministas; nunca credenciales remotas |
| Staging | Variables/secretos de Render | Proyecto, recursos y credenciales exclusivos de staging |
| Producción | Variables/secretos de Render | Proyecto protegido; mínimo privilegio; sin reutilizar staging |

En Render, los valores secretos se cargan desde el dashboard o grupos de
entorno acotados al ambiente. El futuro `render.yaml` sólo declarará referencias
sin valor (`sync: false`) o valores generados por la plataforma.

## Formatos importantes

- `TOKEN_ENCRYPTION_KEYS`:
  `v2:<32 bytes Base64>,v1:<32 bytes Base64>`. La versión debe ser única.
- `DATABASE_URL`: `postgresql://` o `postgres://`, con usuario, contraseña, host
  y base.
- `REDIS_URL`: `redis://` o `rediss://`, con usuario, contraseña y host.
- `META_GRAPH_API_VERSION`: `v<mayor>.<menor>`.
- `OPENAI_PROJECT_ID`: prefijo `proj_`.
- `OPENAI_VECTOR_STORE_ID`: prefijo `vs_`.

Para crear material local de cifrado:

```bash
openssl rand -base64 32
```

El resultado sólo se copia a `.env`; no se agrega a comandos versionados,
issues, capturas ni documentación.

## Verificación

```bash
pnpm config:typecheck
pnpm config:test
```

Las pruebas cubren configuración válida, faltantes, formatos inválidos,
secretos vacíos, grupos parciales, variables públicas no declaradas, redacción y
la cobertura exacta de `.env.example`.

## Fuentes verificadas

Consultadas el 2026-07-24:

- [Variables y secretos en Render](https://render.com/docs/configure-environment-variables)
- [Variables predeterminadas de Render](https://render.com/docs/environment-variables)
- [Secrets Management Cheat Sheet de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
