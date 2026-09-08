# ADR-026: cancelar una programación conserva la pieza aprobada

- Estado: aceptado
- Fecha: 2026-09-08
- Tarea: `P6-T06`

## Contexto

Una programación es una intención temporal sobre un snapshot aprobado, no la
pieza ni su aprobación. La pantalla de calendario debe permitir pausar,
reanudar, mover y cancelar esa intención sin borrar evidencia ni forzar una
edición de contenido. El modelo existente permite `scheduled -> approved`, pero
no declaraba el comando ni qué ocurrencias pueden alterarse.

## Decisión

1. `cancel` de programación sólo cancela la programación y sus ocurrencias
   `planned`; una ocurrencia `dispatched` y su orden quedan inmutables.
2. Si no queda otra programación `active` o `paused` para la pieza y la
   publicación sigue `scheduled`, el comando explícito `unschedule` la devuelve
   a `approved`. Conserva el mismo snapshot y permite programarla otra vez.
3. `pause` conserva las ocurrencias planificadas pero impide que el dispatcher
   las reclame; `resume` sólo devuelve una regla pausada a `active`.
4. Cada mutación compara `expectedVersion` contra la versión de programación,
   incrementa esa versión y registra auditoría. Una edición pierde el conflicto
   antes de cambiar reglas u ocurrencias.
5. Mover o editar sólo difiere/cancela/crea ocurrencias no despachadas. Ningún
   comando de calendario interpreta ni altera el desenlace remoto de una orden.

## Consecuencias

- Cancelar desde el calendario no destruye una aprobación ni obliga a recrear
  una pieza para elegir otra fecha.
- La UI puede explicar qué ocurrencias cambiarán y ofrecer reprogramar sin
  esconder una carrera concurrente.
- Una orden ya creada sigue protegida por la lease e idempotencia de
  [`ADR-024`](ADR-024-SCHEDULED-EXECUTION-LEASE.md).

## Alternativas descartadas

- **Marcar la publicación como `cancelled`**: mezcla la decisión sobre cuándo
  publicar con el ciclo de vida del contenido y obliga a crear otra pieza para
  reprogramar.
- **Borrar la programación y sus ocurrencias**: elimina la evidencia requerida
  para explicar una cancelación y debilita la idempotencia.
- **Permitir editar una ocurrencia `dispatched`**: puede contradecir una orden
  ya materializada o un efecto remoto en reconciliación.
