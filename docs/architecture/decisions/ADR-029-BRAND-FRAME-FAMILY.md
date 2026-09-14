# ADR-029: familia de marcos «Letrero de Chapa» sobre la imagen generada

- Estado: aceptado
- Fecha: 2026-09-14
- Origen: pedido del usuario del 2026-09-13

## Contexto

Las tres piezas de composición de `P4-T05` —tercio inferior, banda superior y
sello central— apoyan la capa de marca en un panel opaco ubicado en el
rectángulo que el prompt le pidió al modelo dejar libre, y la región del perfil
visual decide cuál se usa.

En la práctica aparecieron cuatro problemas:

1. el modelo no siempre deja el producto donde el perfil lo pidió, y la pieza
   sale con el panel encima del producto;
2. el sello central tapa justamente el centro, donde suele quedar el producto;
3. no hay forma de decidir cuánta imagen se tapa ni cuánto se prioriza la
   lectura del texto;
4. la identidad se reduce a un isotipo de 48 px dentro de una caja.

El 2026-09-13 el negocio pidió más marcos: que tapen más o menos imagen, en
distintos tamaños y formas, con la opción de priorizar el texto o la foto, que
digan «FERRETERÍA ARAMAYO» arriba y cuyos textos se puedan cambiar. Eligió
además que la familia nueva sea la pieza por defecto y que cambiar de marco y
de textos se haga desde la variante, sin volver a pagar una imagen.

## Decisión

### 1. Un objeto común: el cartel

Todo marco lleva arriba el **cartel**: una placa con el isotipo aprobado y el
nombre en una línea —«Ferretería Aramayo» o «Lubricentro Aramayo», según la
marca de la pieza— rematada por una pestaña grafito con «EN FRÍAS». Se deriva
del material real de la marca, el cartel del frente del local, y resuelve la
firma local que
[`IMAGE-CREATIVE-IMPROVEMENT-PLAN.md`](../../operations/IMAGE-CREATIVE-IMPROVEMENT-PLAN.md)
dejaba pendiente.

La placa usa `rustDeep` y no `rust`: el blanco sobre `rust` mide 4,19:1 y no
alcanza el umbral de texto; sobre `rustDeep` mide 6,31:1. El lubricentro usa su
amarillo con letra grafito, que supera 10:1.

### 2. Nueve marcos, ordenados por cuánta imagen tapan

| Marco | Qué ocupa | Lectura | Conviene cuando |
|---|---|---|---|
| `marco-firma` | Cartel arriba y un rótulo con titular y botón abajo | Placa | El producto ocupa casi toda la foto |
| `marco-etiqueta` | Una etiqueta de precio de papel en la esquina inferior izquierda | Placa | El producto está al centro o a la derecha |
| `marco-sello` | Un sello circular en el centro, con el botón enganchado a su borde | Placa | La escena dejó el centro libre |
| `marco-velo-superior` | Un velo que baja desde el cartel | Velo | El producto está en la mitad inferior |
| `marco-velo-inferior` | Un velo que sube desde abajo | Velo | El producto está arriba o al centro |
| `marco-columna-izquierda` | Una columna maciza a la izquierda | Placa | El producto está a la derecha |
| `marco-columna-derecha` | Una columna maciza a la derecha | Placa | El producto está a la izquierda |
| `marco-zocalo` | Una base maciza; la foto se apoya encima sin quedar tapada | Placa | Precio y botón tienen que leerse sin esfuerzo |
| `marco-vitrina` | Nada: la foto se ve por una ventana, más chica | Placa | La foto no admite nada encima |

Las variantes son explícitas, una por identificador, como el resto del
catálogo. La columna izquierda y la derecha comparten implementación, pero no
se eligen con una bandera del documento.

Las columnas son placas y no velos. El prototipo con degradado lateral dejaba,
sobre fotos claras, una franja gris junto al texto que parecía un error de
render.

### 3. Dos modos de lectura, los dos medidos

- **Placa**: el texto se apoya en un color de marca opaco. Es la regla de
  `P4-T05` sin cambios.
- **Velo**: el texto se apoya en un degradado de tinta sobre la foto. El velo
  mide lo que mide su texto más un tramo de 240 px en que se desvanece, y el
  texto vive sólo en el tramo denso, cuya opacidad nunca baja de 0,86. El mínimo
  necesario es 0,64: con esa opacidad el papel de marca mide 4,5:1 incluso sobre
  un píxel blanco puro.

La regla «todo lo determinista vive dentro del panel» se generaliza a «dentro
de una zona de marca»: placa, velo, sello, botón que sobresale o cartel, todos
marcados con `data-panel`. La suite de composición comprueba que cada texto
quede dentro de alguna zona y mide el contraste de titular, bajada, precio,
botón, logo, localidad, etiqueta y aclaración sobre los píxeles exportados, en
los cuatro fondos hostiles y con un titular al límite del presupuesto de cada
marco.

### 4. La región del perfil decide sólo el marco por defecto

| Región reservada | Marco por defecto |
|---|---|
| `lower_third` | `marco-zocalo` |
| `upper_band` | `marco-velo-superior` |
| `center_circle` | `marco-sello` |
| `left_column` | `marco-columna-izquierda` |

El prompt, los perfiles y el modelo no cambian. Quien revisa una variante puede
elegir otro marco, y el recorte de la base se recalcula en contra de la zona
que ocupa el marco elegido: la columna derecha como espejo de la izquierda, y
firma, etiqueta y vitrina con el encuadre centrado, porque tapan poco o nada.

Las tres piezas de región siguen vigentes para volver a componer lo que ya se
generó con ellas.

### 5. Etiquetas sustentadas

La etiqueta de la pieza se dibuja fuera del texto que valida el brief, así que
se compone sólo cuando el brief la sustenta. «Oferta» exige un hecho de
promoción verificado. Un producto deja de llevar «Disponible»: afirmaba stock
que nadie había verificado, y un hecho de stock caduca a los cinco minutos
mientras la pieza sigue publicada. Una pieza informativa deja de llevar
«Aramayo», que el cartel ya dice. Las historias diarias conservan «Hoy».

### 6. Lo que invalida y lo que no

Cambiar de marco no genera una imagen nueva ni cambia prompt, perfil o modelo:
**no reabre** la muestra ciega paga de
[`ADR-017`](ADR-017-IMAGE-QUALITY-GATE.md). Sí sube `visualCompositionVersion`,
regenera la línea base de composición, la de regresión visual y la de calidad,
y requiere la revisión visual del negocio.

### 7. Textos

Título, bajada, etiqueta y llamado a la acción son los campos que podrán
editarse desde la variante. Precio y vigencia se siguen componiendo sólo desde
hechos verificados del brief. El cartel no se edita: es la identidad.

## Consecuencias

- Una misma base admite nueve piezas distintas sin gastar tokens.
- El catálogo de composición pasa de tres a doce piezas.
- La suite de composición recorre doce piezas por tres formatos por cuatro
  fondos, más una corrida determinista por pieza y un titular al límite por
  marco y formato. Las referencias PNG siguen fuera de Git; se versiona el
  manifiesto.
- `pnpm frames:catalog` renderiza los nueve marcos sobre fotos reales de la
  biblioteca, en los tres formatos y los cuatro temas, para la revisión humana.
- Bajar la opacidad de un velo sin volver a correr la suite rompe la garantía de
  contraste.
- Elegir marco y editar textos desde la variante es un tipo de edición nuevo, y
  queda para un cambio posterior.
