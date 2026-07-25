# Aramayo Content Platform

Plataforma interna para crear, revisar, programar y publicar contenido de
Ferretería y Lubricentro Aramayo.

El repositorio está en etapa de planificación y estructura inicial. La fuente de
verdad del trabajo es [`docs/STATUS.md`](docs/STATUS.md); el detalle ejecutable de
cada fase vive en [`docs/phases/`](docs/phases/).

## Objetivo del primer producto

Permitir que una persona autorizada:

1. describa una pieza en lenguaje natural y adjunte fotos;
2. consulte conocimiento aprobado de Aramayo y datos vigentes del sistema
   comercial;
3. genere una composición fiel a la marca;
4. revise y apruebe el contenido;
5. publique ahora o programe Instagram y Facebook;
6. audite el resultado y recupere fallas sin duplicar publicaciones.

## Estado actual

- Repositorio y documentación: base inicial completa (`P0-T01`).
- Stack, infraestructura local y configuración: fijados (`P0-T02` a `P0-T04`).
- Aplicaciones ejecutables: bootstrap completo con salud y cierre ordenado
  (`P0-T05`).
- Lint y CI: pendientes de `P0-T06`.
- Motor visual actual: pendiente de migración en Fase 1.
- Credenciales externas: no configuradas.
- Publicaciones externas: deshabilitadas.

## Estructura

```text
apps/
  web/                 Panel de operación
  api/                 Backend modular
  worker/              Generación, render y publicación
packages/
  configuration/       Contratos de entorno por proceso
  contracts/           Contratos compartidos
  process-health/      Sondas de infraestructura y readiness
  domain/              Reglas de negocio puras
  design-engine/       Motor visual a migrar
  brand-knowledge/     Conocimiento aprobado
infrastructure/
  database/            Esquema y migraciones
  local/               PostgreSQL y Redis para desarrollo
docs/
  architecture/        Arquitectura y decisiones
  integrations/        OpenAI, Meta y datos
  operations/          Seguridad, pruebas y operación
  phases/              Tareas y criterios de aceptación
```

## Puesta en marcha local

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm infra:up
pnpm dev
```

Completar en `.env` contraseñas locales para PostgreSQL y Redis, sus
`DATABASE_URL` y `REDIS_URL`, y al menos una llave en `TOKEN_ENCRYPTION_KEYS`
(`openssl rand -base64 32`). Detalle en
[`docs/operations/CONFIGURATION.md`](docs/operations/CONFIGURATION.md).

`pnpm dev` compila los paquetes compartidos y levanta panel, API y worker en
paralelo:

- panel en `http://localhost:3000`;
- API en `http://localhost:3001` con `/health` y `/ready`;
- worker sin HTTP, reportando estado en su log.

## Verificación

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm verify:stack
pnpm verify:plan
```

## Cómo trabajar

1. Leer `AGENTS.md`.
2. Leer `docs/STATUS.md`.
3. Abrir la fase activa y elegir una tarea sin dependencias pendientes.
4. Implementar solamente esa tarea.
5. Ejecutar todas sus verificaciones.
6. Adjuntar evidencia y recién entonces marcarla como completada.

No se debe conectar una cuenta real de Meta ni usar credenciales de producción
antes de completar las puertas de seguridad indicadas en el plan.
