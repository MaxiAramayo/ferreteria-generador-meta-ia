# ADR-014: la base generada viaja embebida en el documento de diseño

- Estado: aceptado
- Fecha: 2026-08-05
- Tarea: `P4-T05`

## Contexto

`ADR-004` fijó el reparto: OpenAI genera el recurso fotográfico y el motor React
compone logo, tipografía, precio, CTA y zonas seguras. `P4-T05` implementa la
segunda mitad, y para eso la imagen que devolvió el proveedor tiene que llegar
al render.

El contrato del documento admitía dos formas de referenciar un activo:
`brand-library`, que nombra un archivo del inventario aprobado, y `remote`, una
URL pública HTTPS. Ninguna de las dos sirve acá sin costo:

- **`remote` obliga a que el render salga a la red.** La base se sube a
  Cloudinary y su `secureUrl` es HTTPS, así que compone. Pero el render pasaría a
  depender de que Cloudinary responda, y de que el contenido en esa URL siga
  siendo el mismo. Hoy `render-document.ts` arma el documento entero en el worker
  —fuentes y activos por `file://`— justamente para que un render no dependa de
  la red.
- **Recuperar los bytes desde el almacenamiento no es posible.** `MediaStorage`
  guarda, borra y firma URLs; no lee. Agregar esa lectura es una capacidad nueva
  que `P4-T04` ya difirió a `P4-T06`.
- **La suite visual no podría existir.** La tarea exige probar la composición
  contra fondos claros, oscuros, recargados y con el producto fuera de centro, en
  todos los formatos. Esos fondos se fabrican localmente; publicarlos en un CDN
  para poder componerlos convertiría una prueba en un despliegue.

## Decisión

`AssetReference` admite una tercera forma: `{ source: "inline", dataUrl }`, con
la imagen en base64 dentro del propio documento.

La composición ocurre **con los bytes en la mano**, ni bien vuelven del
proveedor y antes de anotar la variante. Es el único momento en que esos bytes
existen fuera de OpenAI sin pedirle una lectura al almacenamiento.

Restricciones del contrato:

- sólo `image/png` e `image/jpeg`, y sólo en base64. `image/svg+xml` queda
  afuera de forma explícita: un SVG ejecuta script dentro del render;
- tope de 12 millones de caracteres, que deja margen sobre los ~2,7 M que ocupa
  una base de 1024×1536 en PNG sin admitir un archivo arbitrario;
- la referencia se describe como `inline` en errores y logs, nunca por su
  contenido.

`DESIGN_SCHEMA_VERSION` no sube: agregar una variante a la unión es aditivo y
los documentos ya persistidos siguen parseando igual.

## Consecuencias

- El render sigue sin depender de la red, también para las piezas generadas.
- Volver a renderizar el mismo documento produce el mismo PNG, porque los bytes
  viajan con él. Una URL puede cambiar de contenido o dejar de responder.
- La base se sube igual a almacenamiento, pero para conservar la trazabilidad de
  la generación, no para que el render la lea.
- Un documento con base embebida es pesado. No se persiste como documento: lo
  que se guarda de la composición es el activo renderizado y sus hashes.
- Recomponer una variante vieja —que es de `P4-T06`— va a necesitar los bytes de
  la base otra vez, y ahí sí corresponde evaluar `MediaStorage.read()` o la URL
  remota. Esta decisión no lo cierra.
