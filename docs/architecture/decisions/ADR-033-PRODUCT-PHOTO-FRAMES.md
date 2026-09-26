# ADR-033: marcos de producto con foto propia, en post e historia, y qué se ve

- Estado: aceptado; el negocio aprobó seis de los ocho marcos propuestos el
  2026-09-26, sobre los renders del prototipo en el chat
- Fecha: 2026-09-26
- Tareas: `P2-T10`
- Sucede en parte a: [`ADR-031`](ADR-031-PRODUCT-STORY-OWN-PHOTO.md) (puntos 2
  y 5)
- Relacionadas: [`ADR-029`](ADR-029-BRAND-FRAME-FAMILY.md),
  [`ADR-030`](ADR-030-OPENING-STORY-BRAND-ROTATION.md)

## Contexto

El dueño pidió revisar los marcos para subir productos: «que dependa de cómo
sea la foto se vea si quiero el precio, una descripción, y demás. También el
producto», con «muchos marcos, lindos, bien hechos, bien entendibles y con la
identidad de la ferretería», para posts e historias.

La revisión de lo que había encontró:

1. **No había post con foto propia.** Los cuatro marcos de `ADR-031` eran sólo
   historia; los nueve de `ADR-029` salen en post, pero sólo desde
   «Creatividad IA» y con precio verificado del brief.
2. **Los cuatro marcos eran el mismo esqueleto.** Arriba siempre marca, rubro,
   etiqueta, nombre y bajada sobre un velo; sólo cambiaba dónde caía el precio,
   así que ninguno dejaba libre la parte de arriba de la foto.
3. **No se podía callar nada.** El nombre era obligatorio, sin importe aparecía
   «Consultá precio» a la fuerza, el botón salía siempre y sin rubro aparecía
   «Ferretería y lubricentro», que repite el logo.
4. **Letra chica.** Medidas, vigencia y teléfono quedaban entre 24 y 30 px del
   lienzo, unos 9 pt en el teléfono.
5. **El velo rojo teñía la foto** y un producto rojo se fundía con él; cuatro
   capas sobre la foto la cargaban.
6. **Dos identidades para la misma pieza** según el camino: el encabezado de la
   apertura acá y el cartel «Ferretería Aramayo · En Frías» en los marcos IA.

## Decisión

### 1. Una familia nacida de objetos reales del local

Cada marco sale de algo que el local tiene, no de una plantilla genérica: el
cartel del frente —panel rojo con filete blanco y la localidad al costado—, la
chapa acanalada del techo, las columnas de la vidriera, la etiqueta blanca de
la góndola y la trama hexagonal del isotipo. Todos llevan el mismo cartel, que
en el lubricentro es amarillo con letra grafito.

| Marco | Qué hace | Conviene cuando |
|---|---|---|
| `foto-producto-cartel` | Cartel arriba, placa grafito abajo con nombre, precio y botón | El producto está al medio |
| `foto-producto-vidriera` | Chapa, cartel, la foto como vidrio entre columnas, zócalo con los datos | La foto no admite nada encima |
| `foto-producto-gondola-izquierda` / `-derecha` | El precio en la etiqueta del estante, apoyada en el riel | El producto deja libre un costado abajo |
| `foto-producto-libre` | Cartel chico y, si se pide, nombre, precio y botón apilados | La foto se explica sola |
| `foto-producto-ficha` | Papel de marca con trama, foto recuadrada y datos ordenados | Foto de catálogo o producto que se explica |
| `foto-producto-precio-grande` | Foto arriba, el importe gigante sobre el color del cartel | Una oferta |

Los dos lados de la góndola son identificadores propios, como las columnas de
`ADR-029`: el documento no lleva banderas de posición. El negocio descartó el
sello hexagonal y la columna lateral.

### 2. Post e historia con el mismo marco

Cada marco declara `feed` e `historia`. En la historia, todo lo que se lee
queda dentro de la zona segura (250 px arriba, 300 abajo); la foto, la chapa y
los bloques de color pueden llegar al borde. Vidriera, ficha y precio grande son
columnas: la foto se queda con el alto que dejan los datos, así un nombre largo
achica la foto en vez de empujar el botón fuera de la pieza.

### 3. Qué se ve lo decide quien publica

- **Nombre**: sigue siendo obligatorio —nombra el borrador y la foto—, pero se
  puede pedir que no se dibuje.
- **Precio**: tres casos explícitos. El importe (con precio anterior y unidad,
  «el metro», «c/u»), «Consultá precio», o no hablar del precio.
- **Descripción, etiqueta, medidas y vigencia**: se ven si se escriben.
- **Botón**: el llamado en chico y el teléfono en grande; se puede apagar.

El documento gana dos campos, admitidos sólo por esta familia:

- `hidden`: lista cerrada (`title`, `price`) de lo que la pieza no dibuja.
- `priceUnit`: la unidad del importe.

La validación de borde rechaza los estados que ninguna pieza puede dibujar sin
mentir o dejar un hueco: un importe que además se pide callar, y una unidad sin
importe. Cada marco admite sólo lo que dibuja; el panel lo lee de la misma
especificación y deshabilita lo que el marco elegido no muestra, así un dato
no se guarda como si se hubiera publicado.

### 4. Letra y contraste medidos

Ningún texto de la familia baja de 28 px del lienzo (unos 10 pt en el
teléfono); una prueba lo recorre en todos los marcos y formatos. El rojo vivo
sólo decora —riel, filetes, bordes—: el blanco encima mide 4,19:1. Todo texto
se apoya en el rojo profundo (6,31:1), en grafito, en papel o en el amarillo del
lubricentro con letra grafito, y una prueba mide cada par contra el AA de 4,5:1.
El nombre y el importe se ajustan al ancho con la tabla de avances de Saira
Condensed que ya usa el kit de historias, sin depender de JavaScript en el
render.

### 5. Lo que no cambia

- El precio se dibuja en la pieza y nunca en el caption (`ADR-031`, punto 3):
  la validación previa a publicar no se toca.
- La foto viaja igual que en `ADR-030` y `ADR-031`: preparada en el navegador y
  embebida en el borrador, con su encuadre.
- Guardar deja un borrador; revisar, aprobar y publicar siguen aparte. Un post
  sale por `instagram_feed` y una historia por `instagram_story`, con las
  comprobaciones de formato que ya existían.
- No llama a ningún proveedor ni cambia prompt, perfil o modelo: no reabre la
  muestra paga de `ADR-017`.

### 6. Los cuatro marcos anteriores

`historia-producto-precio-abajo`, `-etiqueta`, `-tarjeta` y `-ventana` salen del
panel pero siguen vigentes en el motor: un borrador guardado con ellos se sigue
componiendo igual. Retirarlos del catálogo haría fallar esos renders.

## Consecuencias

- Un producto con foto propia se publica en post o en historia con siete
  marcos, y la misma foto se prueba en cada uno sin volver a subirla.
- La galería del panel muestra cada marco con la foto y los datos cargados,
  dibujado por el mismo motor que el worker: se elige mirando la pieza, no un
  dibujo.
- La regresión visual suma catorce piezas (siete marcos por dos formatos) y el
  resto del catálogo no cambia.
- `hidden` y `priceUnit` existen en el contrato para cualquier layout futuro,
  pero sólo los admite esta familia: otro layout los rechaza como campo no
  soportado.

## Alternativas descartadas

- **Banderas de «mostrar» por campo en el documento** (`showPrice`,
  `showSubtitle`…): un campo vacío ya no se dibuja; sólo el nombre y el precio
  necesitan un «callar» explícito, porque el nombre es obligatorio y la falta
  de importe ya significa «consultá».
- **Ampliar los cuatro marcos existentes**: su esqueleto común —la cabecera
  arriba sobre un velo— era el problema. Reusarlo habría repetido la misma
  pieza con otra tarjeta.
- **El rojo vivo como fondo del texto**, como en el prototipo aprobado: mide
  4,19:1. El rojo profundo conserva la lectura de chapa pintada y pasa el
  umbral.
- **Sello hexagonal y columna lateral**: prototipados y descartados por el
  negocio.
