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

Cada proceso invoca su parser antes de aceptar trabajo:

| Proceso | Punto de validación | Efecto de un `ConfigurationError` |
|---|---|---|
| API | `apps/api/src/main.ts`, antes de `listen()` | Registra las variables afectadas y termina con código 1 |
| Worker | `apps/worker/src/main.ts`, antes de crear el contexto | Registra las variables afectadas y termina con código 1 |
| Web | `apps/web/instrumentation.ts`, hook `register` | El servidor no sirve contenido: toda solicitud responde 500 |

Los procesos leen `.env` de la raíz del repositorio mediante
`--env-file-if-exists`; en staging y producción las variables provienen del
proveedor y no de archivos versionados.

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
| `PORT` | No | Sí | No | Siempre; Compose fija `3001` en producción |
| `WEB_ORIGIN` | No | Sí | No | Siempre; origen sin path |
| `AUTH_SESSION_TTL_SECONDS` | No | Sí | No | Siempre; entre 15 minutos y 30 días |
| `TRUST_PROXY_HOPS` | No | Sí | No | Siempre; `0` local, `1` detrás de Caddy |
| `WORKER_CONCURRENCY` | No | No | Sí | Siempre; entero entre 1 y 64 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | No | No | Sí | Opcional; ruta absoluta fijada en contenedor |
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
| Staging | Entorno inyectado por proceso | Recursos y credenciales exclusivos; host remoto pendiente |
| Producción | Archivo remoto `0600` inyectado por Compose | VPS dedicado; mínimo privilegio; sin reutilizar staging |

En el VPS, el archivo real vive fuera de Git y sólo puede leerlo el usuario de
despliegue. Docker Compose entrega a cada contenedor únicamente su subconjunto.
Quien administra el daemon Docker puede inspeccionar esos valores y por eso se
considera administrador de secretos.

## Formatos importantes

- `TOKEN_ENCRYPTION_KEYS`:
  `v2:<32 bytes Base64>,v1:<32 bytes Base64>`. La versión debe ser única.
- `DATABASE_URL`: `postgresql://` o `postgres://`, con usuario, contraseña, host
  y base.
- `REDIS_URL`: `redis://` o `rediss://`, con usuario, contraseña y host.
- `META_GRAPH_API_VERSION`: `v<mayor>.<menor>`.
- `OPENAI_PROJECT_ID`: prefijo `proj_`.
- `OPENAI_VECTOR_STORE_ID`: prefijo `vs_`.
- `TRUST_PROXY_HOPS`: `0` cuando la API recibe tráfico directo; `1` en la
  topología donde sólo Caddy comparte la red `edge`.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`: ruta absoluta. La imagen productiva la
  fija a su Chromium compatible con `playwright-core`.

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
pnpm build && pnpm smoke
```

Las pruebas cubren configuración válida, faltantes, formatos inválidos,
secretos vacíos, grupos parciales, variables públicas no declaradas, redacción y
la cobertura exacta de `.env.example`.

El smoke verifica el límite en los procesos reales: arranque rechazado por
variable ausente o formato inválido, errores que nombran la variable sin revelar
su valor, y ausencia de configuración privada en el bundle del navegador y en
las respuestas HTTP.

## Fuentes verificadas

Consultadas el 2026-07-29:

- [Variables en Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)
- [Orden y healthchecks en Docker Compose](https://docs.docker.com/compose/how-tos/startup-order/)
- [Secrets Management Cheat Sheet de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
