# Worker

Proceso separado para:

- generación de recursos con OpenAI;
- render determinístico con Playwright;
- programación y publicación;
- reintentos y reconciliación.

PostgreSQL conserva el estado de negocio. La cola no sustituye a la base.

## Estado actual (`P0-T05`)

El worker todavía no consume colas. Su bootstrap valida la configuración,
reporta el estado real de PostgreSQL y Redis, informa qué integraciones están
habilitadas y cierra de forma ordenada. No ejecuta trabajo simulado.

```text
worker.ready estado=ready dependencias=postgres:up,redis:up concurrencia=4
  openai=deshabilitada cloudinary=deshabilitada meta=deshabilitada
```

El estado se repite como latido periódico y el apagado queda registrado con
`worker.stopped`.

## Comandos

```bash
pnpm --filter @aramayo/worker build
pnpm --filter @aramayo/worker dev
pnpm --filter @aramayo/worker typecheck
```

Las variables se leen del `.env` de la raíz del repositorio. Una configuración
incompleta detiene el proceso con código 1 en lugar de dejarlo vivo esperando
trabajo.
