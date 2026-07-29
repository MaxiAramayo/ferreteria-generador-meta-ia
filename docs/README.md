# Índice de documentación

## Inicio para agentes

- [`../AGENTS.md`](../AGENTS.md): manual operativo, routing y acceso rápido.
- [`../AGENT.md`](../AGENT.md): acceso singular compatible hacia el manual.

## Control del proyecto

- [`STATUS.md`](STATUS.md): estado resumido y fase activa.
- [`EXECUTION_GUIDE.md`](EXECUTION_GUIDE.md): cómo ejecutar y cerrar tareas.
- [`phases/`](phases/): tareas, dependencias, criterios y verificaciones.

## Arquitectura

- [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md)
- [`architecture/DOMAIN.md`](architecture/DOMAIN.md)
- [`architecture/STACK.md`](architecture/STACK.md): versiones fijadas y matriz
  de compatibilidad.
- [`architecture/DESIGN-SYSTEM-SOURCE-MAP.md`](architecture/DESIGN-SYSTEM-SOURCE-MAP.md):
  origen exacto y forma de migración del sistema visual.
- [`architecture/decisions/`](architecture/decisions/)

## Integraciones

- [`integrations/OPENAI.md`](integrations/OPENAI.md)
- [`integrations/RAG_AND_COMMERCIAL_DATA.md`](integrations/RAG_AND_COMMERCIAL_DATA.md)
- [`integrations/KNOWLEDGE-SOURCE-CATALOG.md`](integrations/KNOWLEDGE-SOURCE-CATALOG.md):
  inventario, autoridad, sensibilidad, vigencia y política de afirmaciones.
- [`integrations/KNOWLEDGE-POLICY-SCENARIOS.md`](integrations/KNOWLEDGE-POLICY-SCENARIOS.md):
  revisión de ausencia, contradicción, retiro y aislamiento.
- [`integrations/META.md`](integrations/META.md)

## Operación

- [`../infrastructure/local/README.md`](../infrastructure/local/README.md):
  PostgreSQL y Redis reproducibles para desarrollo.
- [`../infrastructure/production/README.md`](../infrastructure/production/README.md):
  scaffolding no desplegado para el VPS dedicado, Caddy y contenedores.
- [`operations/CONFIGURATION.md`](operations/CONFIGURATION.md): contratos de
  entorno y matriz por proceso.
- [`operations/ENVIRONMENTS.md`](operations/ENVIRONMENTS.md): topología,
  callbacks, recursos, propietarios y ciclo de acceso por ambiente.
- [`operations/VPS_OPERATIONS.md`](operations/VPS_OPERATIONS.md): acceso SSH,
  estado verificado, mantenimiento, despliegue, rollback y acciones prohibidas.
- [`operations/SECURITY.md`](operations/SECURITY.md)
- [`operations/SECRETS.md`](operations/SECRETS.md): almacenamiento, cifrado y
  rotación.
- [`operations/TESTING.md`](operations/TESTING.md)
- [`operations/RELIABLE_OPERATIONS.md`](operations/RELIABLE_OPERATIONS.md):
  idempotencia, auditoría, outbox, leases y retención.
- [`operations/RUNBOOKS.md`](operations/RUNBOOKS.md)

## Regla de precedencia

1. Restricciones legales, seguridad y permisos.
2. `AGENTS.md`.
3. ADR aprobados.
4. Arquitectura y dominio.
5. Fase y tarea activa.
6. Decisiones locales de implementación.

Si dos documentos del mismo nivel se contradicen, no implementar hasta resolver
la contradicción y documentar la decisión.
