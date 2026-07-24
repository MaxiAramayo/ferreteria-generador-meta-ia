# ADR-003: recuperación híbrida

- Estado: aceptado
- Fecha: 2026-07-23

## Decisión

Usar recuperación semántica para documentación aprobada y funciones de solo
lectura para precio, stock y productos.

## Motivos

- Los documentos narrativos se benefician de búsqueda semántica.
- Precio y stock son estructurados, sensibles al tiempo y no deben inferirse.
- El modelo no debe ejecutar SQL ni consultar tablas sin control.

## Consecuencias

- Cada dato comercial necesita fuente y timestamp.
- El brief puede quedar bloqueado por información faltante.
- La publicación revalida datos con vencimiento antes de ejecutarse.
