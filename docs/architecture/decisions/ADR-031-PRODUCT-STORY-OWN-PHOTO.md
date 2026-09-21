# ADR-031: historias de producto con foto propia y precio escrito a mano

- Estado: aceptado
- Fecha: 2026-09-21
- Tareas: `P2-T09`
- Relacionadas: [`ADR-029`](ADR-029-BRAND-FRAME-FAMILY.md),
  [`ADR-030`](ADR-030-OPENING-STORY-BRAND-ROTATION.md)

## Contexto

Los marcos de `ADR-030` resolvieron la apertura y el lubricentro: quien opera
sube una foto, elige el marco que no tapa el motivo y la mueve hasta que queda
bien. El dueño pidió lo mismo para lo que publica el resto de los días —una
historia común, no recurrente— con un producto: «que sea protagonista el
producto y demás, sólo los marcos, y que se pueda subir una imagen».

El catálogo ya tenía `historia-producto` y `historia-producto-precio`, pero
ambas se componen desde un producto del catálogo de Odoo: nombre, precio y
condición vienen de la fuente. Para subir una foto del mostrador y escribir el
precio a mano no existía camino.

El precio es el punto delicado. La validación previa a publicar
(`createApprovalPrePublishProfile` sobre `snapshotContentText`) exige evidencia
vigente del catálogo para cualquier importe que aparezca en el texto de la
publicación. El dueño dijo: «en el caso de que no tenga respaldo, no importa,
si yo lo apruebo que se suba nomás». Bajar esa exigencia dejaría sin red a las
piezas que sí salen del catálogo.

## Decisión

1. Existe una historia de producto con foto propia, en el flujo de
   publicaciones comunes. No es una regla recurrente ni se materializa sola:
   quien opera la arma, la guarda como borrador y sigue el circuito de
   revisar, aprobar y publicar.
2. La historia ofrece cuatro marcos, con la misma idea de `ADR-029` y
   `ADR-030` —cada uno deja libre una zona distinta de la foto—:
   `historia-producto-precio-abajo` (foto a sangre, precio en una tarjeta al
   pie), `historia-producto-etiqueta` (el importe como etiqueta colgada sobre
   la foto), `historia-producto-tarjeta` (datos en una columna a la derecha,
   producto libre a la izquierda) e `historia-producto-ventana` (la foto
   enmarcada sobre el fondo de marca). El identificador nombra la historia y el
   marco, así que un borrador dice con qué se compuso.
3. **El precio se dibuja en la pieza y nunca se escribe en el caption.** Un
   importe en el texto sigue exigiendo evidencia vigente: la validación previa
   no cambia ni una línea. El precio de estas piezas es una afirmación que el
   dueño hace y aprueba con su firma humana al publicar, igual que la foto que
   sube. Es la misma regla que ya rige a la imagen propia de `ADR-030`
   (punto 9): el sistema no puede verificar lo que la imagen afirma, así que la
   aprobación humana es la que responde.
4. Sin precio la pieza no deja un hueco: invita a consultarlo
   (`consultPriceLabel`). Un precio anterior sólo aparece junto a uno nuevo, y
   tachado: solo no compara nada, y el panel lo deshabilita hasta que haya
   precio.
5. La pieza afirma, además del nombre: una línea chica, el rubro, una etiqueta
   corta («Oferta», «Recién llegado»), hasta tres medidas o variantes, hasta
   cuándo vale el precio, y el botón con el teléfono de la marca. Todo lo
   escribe quien publica; nada se deduce del catálogo. El contacto y la firma
   salen del `LayoutContext`, como en toda pieza.
6. La foto viaja igual que en las historias recurrentes (`ADR-030`, punto 10):
   se prepara en el navegador hasta 1440×2560, JPEG sin metadatos, embebida
   como `data:` en el borrador, con `focusX`, `focusY` y `zoom` de 100 a 250.
   El panel la mueve arrastrándola sobre la vista previa real, que es el mismo
   documento que renderiza el worker. Esta historia **crea** la publicación con
   la foto adentro, así que `POST /publications` se suma a las rutas que
   aceptan 4 MB; el resto de la API conserva 100 KB.
7. Los marcos se apoyan en las primitivas compartidas
   (`story-frame-kit.tsx`): la tarjeta al pie, la tarjeta de esquina, el
   recuadro y el velo superior son los mismos que usan la apertura y el
   lubricentro. Un cambio de marco vale para todas las historias con foto.

## Consecuencias

- Una historia de producto se arma con una foto del mostrador y sin tocar el
  catálogo, que es como trabaja hoy el negocio para lo que no está cargado.
- La red que protege los precios citables queda intacta: quien mira el código
  de validación ve la misma regla de siempre, y el camino nuevo no la roza.
- El caption de estas piezas no puede llevar el importe. Es una restricción que
  el panel explica al escribir y que la prueba de
  [`product-story.test.ts`](../../../apps/web/lib/product-story.test.ts) fija.
- Los cuatro marcos entran a la regresión visual y comparten las primitivas, así
  que un ajuste de la tarjeta al pie se ve en apertura, lubricentro y producto a
  la vez: hay que mirar las tres al cambiarla.
- El borrador pesa lo que pesa su foto (0,4 a 1,5 MB), igual que una historia
  recurrente con foto propia.

## Alternativas descartadas

- **Permitir el precio en el caption con una excepción**: sería tocar la
  validación previa para todas las publicaciones, o marcar borradores
  «exentos». Una excepción que se puede activar deja de ser una red. Dibujar el
  precio en la pieza consigue lo que el dueño pidió sin mover la regla.
- **Cargar el producto en el catálogo antes de publicar**: es el camino correcto
  cuando el producto existe en Odoo, y sigue disponible con
  `historia-producto-precio`. Para una foto del mostrador y un precio de
  pizarra, obliga a un alta que nadie va a hacer.
- **Reusar los marcos de apertura tal cual**: comparten primitivas, pero su
  contenido afirma horario y sucursales. Un producto necesita precio, medidas y
  vigencia; mezclarlos permitiría componer una historia que promete lo que no
  es.
- **Un solo marco con el precio siempre abajo**: es lo más simple, pero deja la
  pieza a merced de dónde caiga el producto en la foto. Los cuatro marcos son
  la misma respuesta que `ADR-030` dio para la gata y la moto.
