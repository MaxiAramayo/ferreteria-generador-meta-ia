# ADR-016: edición y selección append-only de variantes

- Estado: aceptado
- Fecha: 2026-08-06
- Tarea: `P4-T06`

## Contexto

Una corrección visual necesita reutilizar la pieza que una persona vio, mientras
que cambiar producto, precio o promoción modifica el brief y exige evidencia
vigente. Sobrescribir la ejecución original borraría la genealogía, y guardar la
variante elegida eliminando las demás impediría comparar o auditar la decisión.

La base y la composición de una variante viven como `MediaAsset`. Para editar
con una referencia real, el worker debe recuperar sus bytes sin confiar en una
URL arbitraria y comprobar que todavía coinciden con el hash y los metadatos
persistidos.

## Decisión

Cada edición crea un `GenerationRun` hijo. El hijo conserva `lineageRootId` y un
origen inmutable formado por `parentRunId`, `parentVariantId`, `kind` e
`instruction`; la ejecución y la variante padre no cambian.

Una edición `visual` sólo parte de una variante exitosa generada por Images y
tiene el mismo `ContentBriefRun`. `MediaStorage.read()` recupera la base
generada original y el worker vuelve a inspeccionar tipo, dimensiones,
tamaño y SHA-256 antes de enviarla a Images. La instrucción humana viaja como
dato no confiable bajo `visual-edit/2026-08-06.1`; las instrucciones fijas
prohíben alterar texto comercial, identidad y hechos.

Una edición `factual` no reutiliza el brief. La API exige un
`ContentBriefRun` posterior, distinto y generado. Por lo tanto cambiar producto,
precio o promoción vuelve a ejecutar la recuperación y las validaciones de
evidencia antes de crear el hijo. El worker genera una base nueva en vez de
editar píxeles antiguos.

La selección es un puntero opcional por ejecución, protegido por
`selectionVersion`. La mutación usa idempotencia, compare-and-swap y auditoría;
no modifica ni elimina variantes. La lectura pública permite comparar
genealogía, instrucción, versión de prompt, perfil, costo, resultado y hashes de
composición, pero no expone el prompt interno completo.

## Consecuencias

- El historial se reconstruye consultando por `lineageRootId` y permanece
  append-only.
- Una variante fallida o sin composición no ofrece comparar, editar ni
  seleccionar.
- Repetir una selección con la misma clave devuelve el mismo resultado; una
  versión desactualizada produce conflicto explícito.
- La lectura de medios permanece confinada al worker y no convierte Cloudinary
  en fuente de verdad.
- Elegir una variante no aprueba, programa ni publica contenido.
