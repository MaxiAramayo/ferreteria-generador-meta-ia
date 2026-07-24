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
- [`integrations/META.md`](integrations/META.md)

## Operación

- [`operations/SECURITY.md`](operations/SECURITY.md)
- [`operations/TESTING.md`](operations/TESTING.md)
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
