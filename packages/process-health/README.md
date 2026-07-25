# Process health

Sondas de infraestructura y agregación de liveness/readiness compartidas por
`apps/api` y `apps/worker`.

El paquete no depende de NestJS, Next.js ni del paquete de configuración: recibe
cadenas de conexión ya reveladas en el borde de composición de cada proceso y
devuelve los contratos publicados en
[`@aramayo/contracts`](../contracts/src/process-health.ts).

- `liveness` responde sin consultar dependencias.
- `readiness` consulta PostgreSQL y Redis y nunca propaga el error del
  proveedor: lo traduce a `down`.
- Ninguna respuesta contiene cadenas de conexión, credenciales ni mensajes
  externos.

La decisión de mantener este límite fuera de las aplicaciones está registrada en
[`ADR-010`](../../docs/architecture/decisions/ADR-010-PROCESS-HEALTH-BOUNDARY.md).
