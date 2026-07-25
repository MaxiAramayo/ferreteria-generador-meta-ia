# API

Backend modular NestJS. La API expone operaciones autenticadas, OAuth y
webhooks, pero no ejecuta generación ni publicación de larga duración dentro de
la solicitud HTTP.

## Estado actual (`P0-T05`)

Sólo existe el bootstrap: validación de configuración, salud del proceso y
cierre ordenado. Todavía no hay autenticación, persistencia ni módulos de
negocio.

| Ruta | Responsabilidad | Respuesta |
|---|---|---|
| `GET /health` | Liveness; no consulta dependencias | 200 mientras el proceso viva |
| `GET /ready` | Readiness; consulta PostgreSQL y Redis | 200 si todas responden, 503 si alguna falla |

El contrato de ambas respuestas vive en
[`@aramayo/contracts`](../../packages/contracts/src/process-health.ts) y las
sondas en [`@aramayo/process-health`](../../packages/process-health/README.md).

## Comandos

```bash
pnpm --filter @aramayo/api build
pnpm --filter @aramayo/api dev
pnpm --filter @aramayo/api typecheck
```

`dev` compila y ejecuta `dist/main.js` con `--watch`. Para recompilar al
guardar, ejecutar en paralelo `pnpm --filter @aramayo/api dev:types`.

Las variables se leen del `.env` de la raíz del repositorio. Un
`ConfigurationError` detiene el arranque con código 1 antes de `listen()`.

## Reglas

- Los controladores permanecen delgados: traducen HTTP y delegan.
- Las reglas de negocio pertenecen al dominio o a casos de uso, no al
  controlador.
- Las cadenas de conexión se revelan sólo en el módulo que compone las sondas.
