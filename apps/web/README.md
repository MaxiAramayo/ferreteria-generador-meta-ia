# Web

Panel interno de creación, revisión, calendario y conexiones.

La arquitectura de los compositores se define en
[`docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md).

## Estado actual (`P0-T05`)

Next.js 16 con App Router y una única pantalla de estado inicial que muestra
ambiente, zona horaria, URL pública de la API y disponibilidad de la API con sus
dependencias. Todavía no hay compositores, autenticación ni datos de negocio.

- El contrato público se valida en `instrumentation.ts` al iniciar el servidor.
  Una variable `NEXT_PUBLIC_` no declarada impide servir contenido.
- La pantalla se renderiza por solicitud (`force-dynamic`) para informar
  infraestructura real y no un resultado congelado en el build.
- La consulta a la API distingue tres estados explícitos: disponible, sin
  readiness e inalcanzable.
- Sólo `NEXT_PUBLIC_API_BASE_URL` llega al navegador; el resto de la
  configuración pertenece a la API y al worker.

Los estilos de `app/globals.css` son mínimos y provisorios: el sistema visual de
Aramayo se migra en Fase 1 según
[`DESIGN-SYSTEM-SOURCE-MAP.md`](../../docs/architecture/DESIGN-SYSTEM-SOURCE-MAP.md).

## Comandos

```bash
pnpm --filter @aramayo/web dev
pnpm --filter @aramayo/web build
pnpm --filter @aramayo/web typecheck
```

`dev` y `start` leen el `.env` de la raíz del repositorio y fijan el puerto
3000; el `PORT` del archivo pertenece a la API.
