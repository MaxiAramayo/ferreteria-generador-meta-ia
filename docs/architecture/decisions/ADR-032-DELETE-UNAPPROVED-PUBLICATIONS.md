# ADR-032: eliminar una pieza que nunca fue evidencia

- Estado: aceptado
- Fecha: 2026-09-22
- Tareas: `P2-T09`
- Relacionadas: [`ADR-031`](ADR-031-PRODUCT-STORY-OWN-PHOTO.md)

## Contexto

El panel no tenía forma de tirar un borrador. La única salida era dejarlo en el
listado, y con las historias de producto cada uno carga su foto embebida: entre
0,4 y 1,5 MB por pieza. El dueño lo pidió sin vueltas: «si quiero eliminar,
quiero que no ocupe espacio tampoco».

La base decía que no, en tres lugares. Las revisiones, sus medios y las
transiciones de estado tenían disparadores `BEFORE UPDATE OR DELETE` que
rechazaban cualquier borrado con `55000`. No era un descuido: el sistema entero
está construido como un rastro de evidencia, y esos tres disparadores son los
que hacen que una pieza publicada no se pueda reescribir ni hacer desaparecer.

La pregunta no era si conviene borrar, sino **qué protege exactamente esa
garantía**. Un borrador que nadie aprobó no es evidencia de nada: no salió, no
se citó, no respalda ninguna publicación. Es trabajo propio de quien lo
escribió.

## Decisión

1. Los tres disparadores pasan a ser **condicionales**, con la misma condición:
   si existe un snapshot de aprobación de esa publicación, no se borra nada. La
   garantía queda más precisa, no ausente.
2. La condición la evalúa la base con `publication_has_approval(uuid)`, no la
   aplicación. Una garantía que depende de que el código se acuerde de
   comprobarla no es una garantía.
3. La API expone `POST /publications/:id/delete` con versión esperada,
   idempotencia y auditoría, como el resto de los comandos. Requiere
   `content:edit`: quien puede armar un borrador puede tirarlo.
4. El servicio además rechaza por estado y por historia: sólo elimina piezas en
   `draft`, `generating_assets`, `generation_failed`, `missing_information`,
   `ready_for_review`, `retrieving_context` o `validation_failed`, y sin
   snapshot, sin programación y sin orden de publicación. Es la misma regla que
   la base, comprobada antes para poder responder con un motivo legible.
5. `generating_assets` entra a propósito: con el worker caído, una pieza no
   puede quedar trabada para siempre. Un render que llega tarde no encuentra la
   publicación y termina en `not-found`, que el worker ya sabe manejar.
6. Se borran la publicación, sus revisiones —con la foto embebida adentro—, los
   medios de esas revisiones, sus transiciones de estado y la materialización
   recurrente si la hubiera. **Sobrevive el renglón de auditoría**, que dice
   quién eliminó qué y cuándo: un registro de la acción, no una copia de la
   pieza.
7. El panel lo llama «Eliminar» y lo confirma diciendo la verdad: se borra para
   siempre, con su foto, y no se puede deshacer.

## Consecuencias

- Quien opera puede limpiar su propio trabajo sin pedirle nada a nadie, y el
  espacio vuelve: una historia de producto con foto pesa entre 0,4 y 1,5 MB.
- Lo que salió sigue intacto. Una pieza aprobada o publicada no se elimina ni
  por la API ni por SQL directo: el disparador la rechaza igual.
- Una pieza que fue aprobada y volvió a borrador tampoco se elimina, porque su
  snapshot existe. Es la regla correcta: ese snapshot es la evidencia.
- El PNG renderizado queda en Cloudinary aunque su pieza se borre. La fila del
  `MediaAsset` sobrevive y su limpieza sigue el ciclo de vida de medios, que es
  otro camino. Se revisa si el almacenamiento crece.
- La reversión está probada: `down.sql` devuelve los tres disparadores
  incondicionales y quita la función.

## Alternativas descartadas

- **Sólo descartar, sin borrar**: la primera versión de esto marcaba la pieza
  como `cancelled` y la sacaba del listado. Satisface la vista, no el pedido:
  la foto sigue ocupando lugar y el dueño dijo explícitamente que no quería eso.
- **Vaciar la revisión en vez de borrarla**: dejar la fila y reemplazar el
  documento por una lápida libera el espacio pesado, pero el mismo disparador
  prohíbe modificar el contenido de una revisión, y una fila que miente sobre
  lo que contuvo es peor que no tenerla.
- **Borrar las filas por SQL a mano**: resuelve el caso de hoy y deja el
  problema para la próxima vez, sin permisos, sin auditoría y sin la protección
  de lo que sí es evidencia.
- **Sacar los tres disparadores**: es más corto de escribir y deja el sistema
  sin la única garantía que impide reescribir lo que se publicó.
