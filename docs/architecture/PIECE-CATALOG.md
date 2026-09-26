# Catálogo de piezas

- Estado: vigente, ampliado por la iteración técnica del 2026-08-11
- Fecha: 2026-08-11
- Decisión que lo habilita: [`ADR-011`](decisions/ADR-011-CURATED-PIECE-CATALOG.md)

Este documento define **qué piezas produce la plataforma y para qué sirve cada
una**. Reemplaza al inventario heredado del generador como fuente de verdad del
catálogo. Una pieza sin objetivo comercial no entra.

## Cómo se decide una pieza

Cada pieza responde tres preguntas antes de existir:

1. **Qué gana quien la ve.** Un precio, una solución a un problema concreto, un
   turno resuelto, una dirección. Nunca "presencia de marca" a secas.
2. **Qué acción habilita.** Consultar por WhatsApp, pedir turno, acercarse al
   local. El CTA nombra una acción real y disponible hoy.
3. **Por qué ese formato.** Feed para lo que se busca y se guarda; historia para
   lo urgente y lo cotidiano; carrusel para comparar o enseñar; destacada para
   ordenar el perfil.

Reglas que ya son invariantes del proyecto y se aplican acá: una idea por pieza,
texto legible en móvil, precio y stock sólo con fuente vigente, y ninguna
afirmación de disponibilidad sin dato que la respalde.

## Pilares de contenido

| Pilar | Qué comunica | Frecuencia sugerida |
|---|---|---|
| Producto con precio | Qué hay y cuánto sale, sin tener que preguntar | 2 por semana |
| Solución de oficio | El problema que resuelve el producto | 1 por semana |
| Servicio de lubricentro | Turnos, cambio de aceite, revisión | 1 por semana |
| Confianza | Locales, atención, medios de pago, reseñas | 1 cada dos semanas |
| Oferta con vigencia | Promoción real, con fecha de fin | según campaña |

## Catálogo vigente

### Feed (1080×1350)

| Pieza | Objetivo | Contenido mínimo | CTA |
|---|---|---|---|
| `producto-destacado` | Mostrar un producto y su categoría | Foto, título, rubro | Consultar stock |
| `producto-editorial` | Mostrar completa una foto generada o real, con la marca como marco | Foto, título, categoría, modelo, precio opcional y disponibilidad confirmada o explícitamente pendiente | Escribir o consultar |
| `producto-precio` | Responder "cuánto sale" sin fricción | Foto, título; precio opcional | Reservar por WhatsApp |
| `promo-producto` | Oferta con precio anterior y vigencia | Foto, título, precio, antes, vigencia | Reservar por WhatsApp |
| `combo-kit` | Vender el conjunto que se compra junto | Hasta 3 productos, precio del combo | Consultar combo |
| `problema-solucion` | Partir del problema del cliente | Problema, solución, producto | Consultar cómo resolverlo |
| `epp-seguridad` | Equipos de protección por rubro | Foto, título, tres puntos | Consultar modelos y talles |
| `producto-mosaico` | Surtido de una categoría | 3 a 6 fotos, título | Consultar disponibilidad |
| `ficha-variantes` | Comparar una línea con varias medidas o modelos | Una escena coherente, 2 a 6 rótulos factuales | Mandar foto o medida |
| `guia-aplicacion` | Ayudar a elegir o usar una categoría sin inventar compatibilidades | Foto real, hasta 3 pasos verificados | Traer la pieza o consultar |

### Historia (1080×1920)

| Pieza | Objetivo | Contenido mínimo | CTA |
|---|---|---|---|
| `historia-producto` | Producto a pantalla completa | Foto, título | Pedir por WhatsApp |
| `historia-precio-dia` | Precio del día, con urgencia real | Foto, título, precio, vigencia | Reservar hoy |
| `historia-turno-lubricentro` | Pedir turno de servicio | Servicio, horario, teléfono | Pedir turno por WhatsApp o en el local |
| `historia-tip` | Tip corto de oficio o mantenimiento | Título, tip, icono | Guardar el tip |
| `historia-locales` | Dónde estamos y hasta qué hora | Direcciones, horario | Cómo llegar |
| `historia-producto-precio` | Vender una categoría o producto con lectura comercial completa | Foto, nombre, uso, precio/condición, anclaje en Frías | Consultar o reservar |
| `historia-problema-solucion` | Explicar una necesidad y la categoría que la resuelve | Problema, solución, referencia, precio/condición | Consulta guiada |
| `historia-surtido-real` | Mostrar una categoría existente en el local sin afirmar stock completo | Foto propia, subcategorías, precio/condición, Frías | Mandar foto o medida |
| `historia-ficha-variantes` | Comparar medidas/modelos con lectura móvil | Una escena coherente, 2 a 6 rótulos factuales | Mandar foto o medida |
| `historia-guia-aplicacion` | Explicar tres pasos para elegir o aplicar una categoría | Foto real, hasta 3 pasos verificados | Traer la pieza o consultar |
| `historia-apertura-cartel` | Avisar que el local abrió, con la foto de lado a lado | Foto real, saludo, estado, sucursales, horario vigente | Escribir por WhatsApp |
| `historia-apertura-horario` | La apertura con el horario del día como protagonista | Foto real como esfera de reloj, horario vigente, sucursales | Escribir por WhatsApp |
| `historia-apertura-locales` | La apertura cuando importan las sucursales | Foto real impresa, una chapa por sucursal, horario vigente | Escribir por WhatsApp |
| `historia-apertura-placa` | La apertura con la foto a sangre y los datos en una placa abajo | Foto real, saludo, rubros, sucursales, horario vigente | Escribir por WhatsApp |
| `historia-apertura-esquina` | La apertura con los datos en una tarjeta arriba a la derecha | Foto real con el motivo abajo a la izquierda, rubros, sucursales, horario | Escribir por WhatsApp |
| `historia-apertura-imagen` | Publicar tal cual una historia armada afuera | La imagen subida por quien opera; siempre con aprobación humana | El que traiga la imagen |
| `historia-lubricentro-ventana` | Recordar el servicio con la foto enmarcada en amarillo | Foto real, servicios, vehículos, dirección y horario vigente | Pedir turno |
| `historia-lubricentro-placa` | El servicio con la foto a sangre y los datos en una placa abajo | Foto real, servicios, vehículos, dirección y horario vigente | Pedir turno |
| `historia-lubricentro-esquina` | El servicio con los datos en una tarjeta arriba a la derecha | Foto real con el motivo abajo a la izquierda, servicios, horario | Pedir turno |
| `historia-lubricentro-imagen` | Publicar tal cual una historia del lubricentro armada afuera | La imagen subida por quien opera; siempre con aprobación humana | El que traiga la imagen |
| `historia-producto-precio-abajo` | Un producto con foto propia y el precio en una tarjeta al pie | Foto real, nombre; precio, medidas y vigencia si los hay | Consultar por WhatsApp |
| `historia-producto-etiqueta` | El importe como la etiqueta colgada de la góndola, sobre la foto | Foto real, nombre; el precio cuelga en la etiqueta | Consultar por WhatsApp |
| `historia-producto-tarjeta` | Los datos en una columna a la derecha, el producto libre a la izquierda | Foto real con el motivo a la izquierda, nombre, precio o consulta | Consultar por WhatsApp |
| `historia-producto-ventana` | El producto enmarcado sobre el fondo de marca, nada encima de la foto | Foto real, nombre, precio o consulta, medidas | Consultar por WhatsApp |

Las cuatro `historia-producto-*` llevan foto propia y el precio lo escribe
quien publica: se dibuja en la pieza y nunca en el caption, porque un importe
en el texto exige evidencia vigente del catálogo
([`ADR-031`](decisions/ADR-031-PRODUCT-STORY-OWN-PHOTO.md)). Sin precio, la
pieza invita a consultarlo en lugar de dejar un hueco. Desde `P2-T10` el panel
ya no las ofrece: siguen vigentes sólo para que los borradores guardados con
ellas se sigan componiendo.

### Producto con foto propia, en post e historia (1080×1350 y 1080×1920)

Una familia nacida de objetos reales del local —el cartel del frente, la
vidriera, la etiqueta de la góndola—, con el mismo cartel en todas. Quien
publica elige el marco según dónde quedó el producto y decide qué se ve: el
nombre y el precio se pueden callar, y el precio es un importe (con anterior y
unidad), «Consultá precio» o nada
([`ADR-033`](decisions/ADR-033-PRODUCT-PHOTO-FRAMES.md)).

| Pieza | Objetivo | Muestra | CTA |
|---|---|---|---|
| `foto-producto-cartel` | El producto al medio, los datos en una placa abajo | Nombre, descripción, etiqueta, medidas, precio, vigencia | Teléfono, opcional |
| `foto-producto-vidriera` | La foto sin nada encima, como la vidriera | Nombre, descripción, etiqueta, precio | Teléfono, opcional |
| `foto-producto-gondola-izquierda` | El precio en la etiqueta del estante, a la izquierda | Nombre, etiqueta, medidas, precio, vigencia | Teléfono, opcional |
| `foto-producto-gondola-derecha` | El precio en la etiqueta del estante, a la derecha | Nombre, etiqueta, medidas, precio, vigencia | Teléfono, opcional |
| `foto-producto-libre` | La foto se explica sola | Nombre y precio, si se piden | Teléfono, opcional |
| `foto-producto-ficha` | Foto de catálogo o producto que se explica | Nombre, descripción, etiqueta, medidas, precio, vigencia | Teléfono, opcional |
| `foto-producto-precio-grande` | Una oferta: el importe manda | Nombre, etiqueta, medidas, precio, vigencia | Teléfono, opcional |

El precio se dibuja en la pieza y nunca en el caption, igual que en `ADR-031`.

### Cuadrado (1080×1080)

| Pieza | Objetivo | Contenido mínimo | CTA |
|---|---|---|---|
| `tip-oficio` | Enseñar algo útil y ganar guardados | Título, hasta 4 puntos | Guardar para la próxima compra |
| `testimonio` | Prueba social de un cliente real | Reseña, autor, servicio | Ver más opiniones |
| `lubricentro-servicio` | Explicar un servicio del lubricentro | Servicio, beneficio, foto | Pedir turno |

### Composición con imagen generada (1080×1350, 1080×1080, 1080×1920)

Estas tres piezas son la mitad determinista de
[`ADR-004`](decisions/ADR-004-DETERMINISTIC-BRAND-RENDER.md): el fondo lo produce
un modelo y encima se compone la capa de marca sobre un panel opaco, ubicado en
el mismo rectángulo que el prompt le pidió al modelo dejar libre. El nombre
describe esa región, porque es lo que decide qué contenido sostiene cada una.

| Pieza | Objetivo | Contenido mínimo | CTA |
|---|---|---|---|
| `composicion-tercio-inferior` | Producto o promoción con la escena generada | Título; precio, bajada y vigencia opcionales | Reservar por WhatsApp |
| `composicion-banda-superior` | Contexto de taller o de servicio | Título | Consultar por WhatsApp |
| `composicion-circulo-central` | Promoción con vigencia, como sello | Título; precio y vigencia opcionales | Aprovechar por WhatsApp |

Reglas que las gobiernan:

1. **Todo lo determinista vive dentro del panel**, incluido el logo. Nada de la
   capa de marca se apoya en píxeles que decidió un modelo: es lo que permite
   afirmar un umbral de contraste en lugar de suponerlo.
2. **El panel no crece.** Nunca pasa el rectángulo reservado, y el contenido se
   elige para que entre: la banda superior es ancha y baja, así que no lleva
   precio; el tercio inferior sólo lleva bajada cuando el formato le deja alto.
   El rectángulo es un techo: la banda superior mide lo que su contenido, para
   no tapar foto que no usa.
3. **Se componen en feed, cuadrado e historia.** Un banner de Facebook y una
   portada destacada no sostienen el bloque de marca sin achicar el titular hasta
   que deje de serlo, y la portada ya tiene su propia pieza.
4. **Sin imagen generada se componen igual**, con el fondo de marca del tema. Una
   pieza que sale por el camino determinista no es una pieza incompleta.

Desde [`ADR-029`](decisions/ADR-029-BRAND-FRAME-FAMILY.md) una composición nueva
sale con un marco de la familia siguiente; estas tres piezas quedan vigentes
para volver a componer lo que ya se generó con ellas.

### Marcos de marca «Letrero de Chapa» (1080×1350, 1080×1080, 1080×1920)

Nueve marcos para la imagen generada, todos con el cartel de la marca arriba: el
isotipo, «Ferretería Aramayo» o «Lubricentro Aramayo» según la pieza, y la
pestaña «EN FRÍAS». Se diferencian por cuánta imagen tapan y por dónde, así que
se elige el que deja libre el lugar donde quedó el producto.

| Pieza | Qué tapa | Contenido | Conviene cuando |
|---|---|---|---|
| `marco-firma` | El cartel y un rótulo abajo | Título y botón | El producto ocupa casi toda la foto |
| `marco-etiqueta` | Una etiqueta de papel en la esquina inferior izquierda | Título; etiqueta, precio o «Consultá precio», vigencia y botón | El producto está al centro o a la derecha |
| `marco-sello` | Un sello circular en el centro | Título; precio o «Consultá precio», vigencia y botón | La escena dejó el centro libre |
| `marco-velo-superior` | Un velo que baja desde arriba | Título; etiqueta, bajada, precio, vigencia y botón | El producto está en la mitad inferior |
| `marco-velo-inferior` | Un velo que sube desde abajo | Título; etiqueta, bajada, precio, vigencia y botón | El producto está arriba o al centro |
| `marco-columna-izquierda` | Una columna maciza a la izquierda | Título; etiqueta, bajada corta, precio, vigencia y botón | El producto está a la derecha |
| `marco-columna-derecha` | Una columna maciza a la derecha | Título; etiqueta, bajada corta, precio, vigencia y botón | El producto está a la izquierda |
| `marco-zocalo` | Una base maciza; la foto queda entera encima | Título; etiqueta, bajada, precio o «Consultá precio», vigencia y botón | Precio y botón tienen que leerse sin esfuerzo |
| `marco-vitrina` | Nada: la foto se ve por una ventana, más chica | Título; etiqueta, precio, vigencia y botón | La foto no admite nada encima |

Reglas que los gobiernan:

1. **Todo texto vive en una zona de marca**: placa, velo, sello o cartel. Sobre
   un velo, el texto ocupa sólo el tramo cuya opacidad no baja de 0,86.
2. **La región del perfil decide sólo el marco por defecto**: `lower_third` sale
   con zócalo, `upper_band` con velo superior, `center_circle` con sello y
   `left_column` con columna izquierda. Quien revisa la variante puede elegir
   otro, y el recorte se corre en contra del marco elegido.
3. **Cada marco declara su presupuesto de titular y los campos que ubica.** Un
   titular que no entra en el marco elegido se rechaza antes de componer.
4. **La etiqueta se compone sólo cuando el brief la sustenta**: «Oferta» con un
   hecho de promoción verificado y «Hoy» en la historia diaria. Un producto ya
   no lleva «Disponible», que afirmaba stock sin fuente.

### Banner y destacadas

| Pieza | Objetivo | Contenido mínimo | CTA |
|---|---|---|---|
| `banner-marca` | Portada de Facebook con datos de contacto | Título, sucursales, teléfono | — |
| `destacada-cover` | Ordenar el perfil por categoría | Icono, título accesible | — |
| `presentacion-marca` | Presentación del negocio y sus rubros | Foto, título, rubros | Consultar por WhatsApp |
| `sucursales` | Las dos sucursales con su detalle | Dos fotos, direcciones, horario | Consultar por WhatsApp |

## Clasificación del inventario heredado

| Estado | Identificadores | Criterio |
|---|---|---|
| Vigente | `producto-destacado`, `producto-editorial`, `promo-producto`, `producto-mosaico`, `epp-seguridad`, `tip-oficio`, `lubricentro-servicio`, `presentacion-marca`, `sucursales`, `banner-marca`, `destacada-cover`, `historia-producto`, `historia-locales` | Tienen objetivo claro y contenido real; están migradas |
| Retirado | Los nueve `carrusel-*` y las historias listadas abajo | Campañas puntuales, sin contenido vigente, o reemplazadas por una pieza nueva |

Piezas heredadas reemplazadas por una pieza del catálogo propio:

| Pieza heredada | La reemplaza | Por qué |
|---|---|---|
| `historia-promo`, `historia-oferta-diaria` | `historia-precio-dia` | Una sola pieza de precio con vigencia, en lugar de dos casi iguales |
| `historia-tip-diario` | `historia-tip` | Misma idea con pasos numerados y jerarquía más clara |
| `historia-recordatorio-lubricentro`, `historia-lubricentro-diaria` | `historia-turno-lubricentro` | El objetivo es el turno, no el recordatorio |
| `historia-producto-del-dia`, `historia-reposicion` | `producto-precio`, `historia-precio-dia` | El precio resuelve mejor lo que buscaban esas piezas |
| `historia-apertura`, `historia-informativa`, `historia-encuesta`, `historia-preguntas`, `historia-resena` | — | Sin contenido vigente; `testimonio` cubrirá la prueba social cuando se aprueben las reseñas |

Los identificadores retirados siguen registrados para conservar la trazabilidad
con la línea base congelada; componerlos falla de forma explícita.

## Decisiones del negocio (2026-07-27)

1. **El precio es opcional en la pieza.** Puede mostrarse o dejarse para
   responder por WhatsApp, según lo que convenga a cada publicación. Las piezas
   de precio se componen igual con y sin él: sin precio, el lugar del número lo
   ocupa la invitación a consultar.
   Para `producto-editorial`, el usuario precisó el 2026-08-31 que esa
   invitación dice «Consultar precio» con tipografía de cuerpo y sin el
   rótulo «Precio minorista». Las piezas con importe conservan su jerarquía.
2. **Los turnos del lubricentro se toman por WhatsApp o en el local.** Ese es el
   CTA; no se promete reserva online.
3. **El carrusel se conserva como formato**, pero su contenido está sin definir:
   qué enseña y qué ofrece cada tarjeta se decide antes de componerlo.
4. **`testimonio` queda para después.** Hay reseñas en Google Maps; usarlas
   requiere revisar autorización y forma de atribución.
5. **El catálogo va a crecer.** Esta versión cubre lo esencial; se refina con
   más piezas en una tarea posterior.
6. **Las variantes comerciales de historia son explícitas.** No comparten un
   compositor gobernado por banderas: cada familia define su jerarquía y todas
   reutilizan únicamente el marco local, precio, disclaimer y pie.
7. **El comparador de variantes y la pieza de uso son composiciones distintas.**
   La primera compara medidas o modelos provenientes de una fuente comercial
   sobre una escena coherente; la segunda explica una elección o uso respaldado
   dentro de una escena propia. No se reutiliza una grilla para simular pasos ni
   se inventa una medida.

## Pendientes de definición

- Contenido y estructura del carrusel: qué enseña, en cuántas tarjetas y con
  qué oferta cierra.
- Piezas adicionales que el negocio quiera publicar y todavía no están acá.
- Uso de reseñas reales en `testimonio`, con autorización y atribución.
