# ADR-011: catálogo curado de piezas en lugar de paridad 1:1

- Estado: aceptado
- Fecha: 2026-07-27
- Tarea: `P1-T04`

## Contexto

La Fase 1 se planteó como una migración por paridad: reproducir los 33 layouts
del generador y aprobar la migración comparando píxeles contra las referencias
congeladas en `P1-T01`.

Con once layouts migrados, el negocio revisó el resultado y fijó otra
prioridad: el objetivo no es reproducir lo que había, sino **publicar mejor**.
Las piezas deben partir de una idea de marketing —qué problema resuelve el
producto, por qué conviene consultar hoy— y pueden usar otros formatos, otra
jerarquía y otros recursos.

Los 33 layouts del generador tampoco son un catálogo diseñado: son lo que se
fue acumulando. Varios se solapan, algunos nunca tuvieron contenido real y
otros existen sólo por una campaña puntual.

## Decisión

La Fase 1 migra un **catálogo curado**, no el inventario completo.

- El catálogo vigente se define en
  [`PIECE-CATALOG.md`](../PIECE-CATALOG.md): cada pieza declara objetivo
  comercial, formato, contenido mínimo y llamada a la acción.
- Cada identificador del inventario congelado queda clasificado como
  `vigente` (se migra tal cual), `rediseño` (la idea se conserva pero la pieza
  se rehace) o `retirado` (no se migra).
- Una pieza `retirada` no tiene componente: componerla falla con
  `layout: not-registered`. No se borra del registro histórico para no perder
  la trazabilidad con la línea base.
- La línea base congelada deja de ser un objetivo de paridad y pasa a ser
  **referencia y control de regresión de identidad**: colores, tipografías,
  marca y activos siguen comparándose contra ella; la composición de cada pieza,
  no.

## Consecuencias

- `P1-T04` ya no exige un componente por cada identificador inventariado, sino
  uno por cada pieza del catálogo vigente.
- `P1-T06` aprueba paridad de **identidad** (tokens, marca, activos) y calidad
  de las piezas nuevas contra sus propios criterios, no contra un PNG anterior.
- Cada pieza nueva necesita una referencia propia aprobada antes de habilitarse
  para publicación: la evidencia visual se genera con el exportador de
  `P1-T05`.
- El catálogo es una decisión de negocio: agregar, rediseñar o retirar una pieza
  requiere aprobación explícita y actualizar `PIECE-CATALOG.md` en la misma
  tarea.

## Alternativas descartadas

### Completar los 33 layouts y luego rediseñar

Duplica el trabajo: obliga a reproducir composiciones que el negocio ya decidió
cambiar y a mantenerlas hasta el rediseño.

### Empezar de cero sin línea base

Perdería el control de identidad. La línea base sigue siendo la única evidencia
verificable de colores, tipografías, marca y activos aprobados.
