# Plan maestro por fases

Este directorio es el backlog ejecutable del proyecto. Cada tarea tiene un ID
estable, dependencias, entregables, criterios de aceptación y una verificación
reproducible. La forma de operar está definida en
[`../EXECUTION_GUIDE.md`](../EXECUTION_GUIDE.md).

## Orden de ejecución

1. [`PHASE-0-FOUNDATION.md`](PHASE-0-FOUNDATION.md)
2. [`PHASE-1-DESIGN-ENGINE.md`](PHASE-1-DESIGN-ENGINE.md)
3. [`PHASE-2-PLATFORM-CORE.md`](PHASE-2-PLATFORM-CORE.md)
4. [`PHASE-3-OPENAI-RAG.md`](PHASE-3-OPENAI-RAG.md)
5. [`PHASE-4-IMAGE-GENERATION.md`](PHASE-4-IMAGE-GENERATION.md)
6. [`PHASE-5-META-PUBLISHING.md`](PHASE-5-META-PUBLISHING.md)
7. [`PHASE-6-SCHEDULING.md`](PHASE-6-SCHEDULING.md)
8. [`PHASE-7-PRODUCTION.md`](PHASE-7-PRODUCTION.md)

## Convenciones

- `[ ]`: pendiente o parcialmente ejecutada.
- `[x]`: completa, verificada y con evidencia.
- `BLOQUEADA`: no puede continuar; la causa debe ser concreta.
- Una fase termina cuando todas sus tareas y criterios de salida están `[x]`.
- Una tarea no se marca completa solamente porque el código fue escrito.
- Las dependencias expresadas como `P?-T??` deben existir en estos documentos.
- Los criterios no se eliminan: una excepción requiere justificación y ADR
  cuando cambia una decisión arquitectónica.

## Plantilla mínima para nuevas tareas

```md
## P?-T?? — Nombre

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P?-T??` o Ninguna
- Riesgo: Bajo | Medio | Alto

### Objetivo

Resultado observable que debe alcanzar la tarea.

### Entregables

- Archivo, flujo, servicio o decisión concreta.

### Criterios de aceptación

- [ ] Condición binaria y verificable.

### Verificación obligatoria

- [ ] Comando o procedimiento reproducible.

### Fuera de alcance

- Trabajo que no debe introducirse en esta tarea.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.
```
