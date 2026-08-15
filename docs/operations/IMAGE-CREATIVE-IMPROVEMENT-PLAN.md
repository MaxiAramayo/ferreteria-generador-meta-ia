# Plan de mejora visual y comercial para contenido de producto

- Estado: contrato visual prototipado; revisión del negocio pendiente
- Fecha: 2026-08-07
- Tarea activa: `P4-T08`
- Alcance: Ferretería Aramayo, Instagram orgánico y piezas verticales aptas para
  promoción futura

## Resultado buscado

Las piezas tienen que parecer publicidad de un comercio real de Frías, no una
demostración de generación de imágenes. En dos o tres segundos una persona debe
poder responder:

1. quién vende;
2. qué producto, categoría o solución se ofrece;
3. para qué sirve;
4. cuánto cuesta, cuando existe un precio vigente;
5. que puede consultarlo o conseguirlo en Frías.

La IA queda como recurso auxiliar. No se usa para fabricar evidencia del local,
del stock ni de la apariencia exacta de un producto de marca.

## Diagnóstico de la muestra actual

La historia `reposicion-02-plomeria-surtido.png` marca una dirección útil:

- parte de una foto real y creíble del surtido;
- presenta una sola categoría;
- mantiene una jerarquía fuerte;
- identifica a Aramayo y deja un CTA claro;
- explica qué puede encontrar la persona, no sólo muestra una imagen bonita.

Antes de adoptarla como patrón hay que corregir cuatro cosas:

- `STOCK COMPLETO` sólo puede aparecer con una fuente comercial vigente. Sin
  esa evidencia debe decir `SURTIDO DE PLOMERÍA` o una afirmación verificable;
- `FRÍAS` es demasiado pequeño para alguien que recibe la pieza como anuncio.
  El anclaje local debe ser un bloque principal, no la letra chica del logo;
- el texto explicativo puede reducirse para lectura inmediata en teléfono;
- una pieza de venta necesita una zona comercial mayor para nombre exacto,
  precio, condición o vigencia y CTA.

## Lo aprendido de referencias externas

La revisión del 2026-08-07 no encontró una plantilla universal que convenga
copiar. Sí mostró principios consistentes:

- Meta recomienda un único foco, poco texto y consistencia entre piezas. Para
  productos tangibles también recomienda mostrar el producto en uso cuando eso
  ayuda a entender el beneficio
  ([Meta, Photo Ads](https://www.facebook.com/business/ads/photo-ad-format)).
- La cuenta de Easy alterna campañas, contexto de uso, servicios y producto. En
  una publicación sobre revestimientos explica el problema y la solución, pero
  muchos comentarios vuelven a pedir precio, medidas, unidades por caja y
  compatibilidad. Para Aramayo esos datos no deben quedar ocultos cuando el
  objetivo es vender
  ([publicación observada](https://www.instagram.com/easyargentina/reel/DbLhBXUFLTC/),
  [perfil](https://www.instagram.com/easyargentina/)).
- Sodimac documenta redes como canal de asesoramiento, campañas y comunidad de
  aprendizaje, y declara que sus campañas parten de necesidades del cliente
  antes que de categorías aisladas. Es una referencia conceptual, no evidencia
  actual de rendimiento
  ([reporte oficial, pp. 49–50](https://images.sodimac.com/v3/assets/blt81efde09fd00e46f/bltcdb3e93d1745e2f8/6-Sodimac-Reporte-Sostenibilidad-2022-FINAL.pdf)).
- Para Reels promocionados, Meta recomienda formato vertical, elementos clave
  dentro de la zona segura y experimentación A/B. Sus resultados agregados no
  deben trasladarse como promesa de rendimiento local
  ([Meta, Reels Ads](https://www.facebook.com/business/ads/facebook-instagram-reels-ads)).

La conclusión para Aramayo es combinar utilidad, prueba local e información de
compra. Una imagen espectacular sin precio, aplicación o ubicación genera
preguntas; una placa llena de texto no detiene el desplazamiento.

## Política de verdad visual

Cada pieza debe declarar uno de estos modos antes de seleccionar o generar una
imagen:

| Modo | Imagen admitida | Afirmación permitida | Requisito visible |
|---|---|---|---|
| `exact-product` | Foto propia o activo autorizado del fabricante del SKU exacto | Nombre, marca, modelo y precio exactos | Fuente del activo y snapshot comercial |
| `category-representation` | Foto real o generación simple de un artículo similar de la misma categoría | Uso y categoría; el SKU textual puede venderse sólo si no se atribuye su apariencia a la imagen | `IMAGEN ILUSTRATIVA` visible |
| `real-local-stock` | Foto real del local o depósito de Aramayo | Surtido observado y disponibilidad respaldada | Fecha, sucursal y fuente de stock |
| `generated-context` | Fondo o escena genérica simple | Problema, oficio o contexto de uso | Nunca insinuar que es el local, el personal o el stock real |
| `deterministic-only` | Color, textura o composición code-native | Información comercial respaldada | No inventa una foto para completar el espacio |

Orden de preferencia de activos:

1. foto real tomada por Aramayo;
2. foto oficial autorizada del fabricante o distribuidor para el SKU exacto;
3. foto real autorizada de la categoría;
4. escena genérica simple generada con IA;
5. pieza determinista sin fotografía.

No se descarga una foto cualquiera desde un buscador. Cada activo externo debe
registrar URL de origen, propietario, alcance del permiso, fecha, SKU o categoría
y `ownershipNote`. La autorización general para usar marcas no reemplaza la
trazabilidad del archivo concreto.

### Regla comercial para imágenes ilustrativas

Una representación similar puede acompañar la venta de un producto, pero no
puede parecer una foto del modelo exacto. Debe cumplir las tres condiciones:

- el nombre y precio exactos viven en la capa determinista;
- aparece `IMAGEN ILUSTRATIVA` con lectura móvil;
- no muestra una marca, etiqueta, accesorio o característica incompatible con
  el artículo vendido.

Para precios `DESDE $…`, el snapshot debe definir qué productos elegibles
sustentan ese mínimo. Sin esa lista no se usa `desde`.

## Familias de piezas

### 1. Producto + precio

Para vender un SKU concreto.

- imagen: `exact-product` como primera opción;
- bloque superior: `FERRETERÍA ARAMAYO · FRÍAS`;
- centro: producto completo y un solo beneficio o uso;
- panel comercial: nombre, medida/modelo, precio grande, condición o vigencia;
- CTA: `CONSULTANOS POR WHATSAPP` o `CONSEGUÍLO EN FRÍAS`;
- si la imagen es representativa: disclaimer obligatorio.

### 2. Problema + solución

Para explicar una categoría sin convertir la pieza en catálogo.

- abre con una situación concreta: pérdida, pared, corte, fijación o
  mantenimiento;
- muestra un único contexto simple, preferentemente real;
- explica qué categoría resuelve el problema y una restricción importante;
- el precio puede ir en la segunda historia o en una tarjeta separada;
- CTA: consulta guiada, por ejemplo `DECINOS QUÉ MEDIDA NECESITÁS`.

### 3. Surtido real en Frías

Para reposición, llegada o amplitud de categoría.

- usa únicamente una foto real de góndola, depósito o mostrador;
- `EN FRÍAS` ocupa un lugar visible desde el primer vistazo;
- enumera dos o tres subcategorías, no una lista exhaustiva;
- no afirma `stock completo`, `recién llegado` ni disponibilidad sin fuente;
- CTA: `MANDANOS FOTO O MEDIDA Y TE CONFIRMAMOS`.

### 4. Marca y ficha breve

Para fabricantes o líneas autorizadas.

- activo oficial o foto propia del producto exacto;
- marca, modelo, compatibilidad y dato técnico respaldado;
- precio opcional pero prominente si el objetivo es conversión;
- no se generan etiquetas, envases ni logos de terceros.

### 5. Oferta local

Para campañas puntuales, no como aspecto permanente del perfil.

- producto exacto, precio anterior/actual sólo cuando la fuente lo permite;
- vigencia y condiciones junto al precio;
- `OFERTA EN FRÍAS` como anclaje;
- cero sellos falsos, urgencia inventada o descuento sin referencia.

Las tres primeras familias son el mínimo para la próxima muestra. Las otras dos
amplían variedad sin convertir todas las publicaciones en la misma placa.

## Jerarquía visual propuesta

Los siguientes valores son objetivos de prototipo, no una supuesta fórmula de
rendimiento:

- identidad y anclaje local: 12–16 % de la altura útil;
- imagen de producto o contexto: 45–55 %;
- explicación, precio y CTA: 30–38 %;
- máximo de cuatro bloques semánticos: marca/localidad, producto, precio/dato y
  CTA;
- el precio debe ser el elemento numérico dominante y conservar moneda,
  unidad, condición y vigencia próximas;
- titular de una o dos líneas; explicación de hasta dos líneas en la primera
  historia;
- `FRÍAS` no se integra como detalle dentro de una foto generada: se compone con
  tipografía aprobada.

En 1080 × 1920 se prototiparán numerales de precio de 150–220 px y un encabezado
Aramayo/Frías de 120–170 px. La decisión final depende de pruebas a tamaño real,
zonas seguras y longitud de los precios argentinos.

## Prompt visual v3

### Cambio de criterio

El prompt actual contiene instrucciones como luz cálida, sombras largas,
ambiente oscuro, iluminación mixta o clima estacional. Juntas producen una
estética cinematográfica repetida que se reconoce como “filtro de IA”. La nueva
versión debe pedir color neutro y limitar la complejidad antes de agregar más
adjetivos de realismo.

La mejora principal no es escribir `fotorrealista` muchas veces. Es reducir lo
que se le pide al modelo:

- un sujeto o una familia de objetos por generación;
- sin texto, logos, carteles, patentes ni señalética;
- sin local de Aramayo, camioneta de Aramayo o personal de Aramayo inventados;
- sin vehículo, persona, mampostería compleja y herramienta crítica en una
  misma escena;
- color natural, balance de blancos neutro y exposición normal;
- geometría físicamente plausible y materiales reales;
- encuadre amplio para la capa determinista, sin marcos generados.

### Estructura obligatoria

```text
OBJETIVO
Una base fotográfica para una pieza comercial; no es el anuncio final.

SUJETO
Un solo sujeto o una única categoría, con forma y escala plausibles.

ESCENA
Lugar genérico y simple. Nunca representar el local real si no hay referencia.

FOTOGRAFÍA
Fotografía comercial documental sin retoque evidente, óptica y perspectiva
naturales, profundidad de campo moderada.

LUZ Y COLOR
Luz diurna o de estudio neutra, balance de blancos real, contraste moderado,
colores fieles, textura y pequeñas imperfecciones físicas conservadas.

COMPOSICIÓN
Un foco principal y el rectángulo reservado completamente tranquilo.

EXCLUIR
Texto, logos, etiquetas, estética CGI, HDR, bloom, niebla, viñeta, teal-orange,
brillos plásticos, sobresaturación, desenfoque artificial, objetos duplicados,
geometría imposible, piezas flotantes y detalles decorativos gratuitos.
```

### Regla de corte

Si la idea depende de que una camioneta tenga una marca correcta, de que el
cartel del local diga Aramayo, de que un disco tenga geometría exacta o de que
los ladrillos prueben un material real, no se genera esa escena. Se solicita o
selecciona una foto real. El prompt no puede garantizar esos hechos.

## Estrategia de contenido para Frías

Hasta disponer de métricas reales, el mix inicial para evaluar dirección —no
una frecuencia de publicación— es:

- 30 % soluciones y explicación de uso;
- 30 % producto con nombre, dato útil y precio cuando corresponda;
- 25 % prueba local: local, góndola, reposición y equipo real;
- 10 % servicios, confianza y atención;
- 5 % promociones con vigencia y condiciones.

El anclaje local es obligatorio en producto/precio, oferta y cualquier pieza
que pueda promocionarse a público frío. Las variantes a probar son:

- `CONSEGUÍLO EN FRÍAS`;
- `DISPONIBLE EN FRÍAS` sólo con disponibilidad vigente;
- `FERRETERÍA ARAMAYO · FRÍAS` como firma constante.

No se adopta un horario ni una frecuencia “recomendada” sin datos del negocio.
La cuenta todavía necesita aprobar su contexto persistente de audiencia, voz,
plataformas y objetivos antes de crear un calendario editorial.

## Nueva puerta de calidad

Además de los controles existentes, toda muestra debe evaluar:

| Criterio | Falla bloqueante |
|---|---|
| Apariencia natural | filtro cinematográfico repetido, CGI, plástico o retoque evidente |
| Integridad geométrica | herramienta, disco, ladrillo, vehículo, mano o producto deformado |
| Verdad visual | la imagen parece exacta o local cuando es ilustrativa o genérica |
| Identidad local | Aramayo y Frías no se leen a tamaño móvil en una pieza de conversión |
| Utilidad comercial | no se entiende qué es, para qué sirve, precio/condición o próximo paso |
| Procedencia | activo sin propietario, permiso, URL o alcance registrado |

Un detector automático de “imagen IA” no decide la aprobación. La señal válida
es la revisión humana acompañada por defectos concretos y verificables.

## Plan de implementación

### Etapa 0 — Acordar el contrato visual

- aprobar los cinco modos de verdad visual;
- elegir la frase local constante;
- aprobar cuándo una representación ilustrativa puede acompañar un SKU;
- definir cómo se expresan precio, unidad, vigencia y condiciones.

### Etapa 1 — Activos y procedencia

- inventariar fotos propias del local, góndolas y productos;
- registrar activos de fabricantes autorizados por SKU;
- agregar estado de licencia/procedencia y bloquear archivos sin trazabilidad;
- preparar una guía corta para tomar fotos con celular, luz natural y fondo
  limpio.

### Etapa 2 — Tres plantillas code-native

- [x] implementar `Producto + precio`, `Problema + solución` y `Surtido real`;
- agrandar el marco Aramayo/Frías;
- crear precio, condición, vigencia y `IMAGEN ILUSTRATIVA` como primitivas
  deterministas;
- validar 9:16 y 4:5 a tamaño móvil.

La primera implementación usó tres variantes explícitas para historia
(`historia-producto-precio`, `historia-problema-solucion` e
`historia-surtido-real`) y sus equivalentes de feed. El negocio rechazó esa
primera dirección el 2026-08-11. La siguiente iteración reemplaza la muestra por
dos familias propias: `ficha-variantes` / `historia-ficha-variantes` para una
línea con medidas o modelos, y `guia-aplicacion` /
`historia-guia-aplicacion` para una escena de uso con hasta tres orientaciones.
Logo,
`EN FRÍAS`, nombre, rótulos, pasos, precio, condición, disclaimer y CTA se
componen en código.

### Etapa 3 — Selector de recurso y prompt v3

- seleccionar primero activo real, luego autorizado, luego generación simple;
- incorporar el modo de verdad visual al plan y a la auditoría;
- neutralizar los perfiles de luz y color que hoy producen el filtro repetido;
- limitar sujetos y complejidad; rechazar ideas que exijan evidencia inventada;
- versionar perfiles, prompt y snapshots.

### Etapa 4 — Muestra comparativa

Crear, sin publicar:

- tres conceptos comerciales, uno por cada familia mínima;
- exactamente tres historias 9:16 y tres posts 4:5: seis piezas totales, no
  doce;
- casos sin marca cuando la categoría, el uso y el precio puedan comunicarse
  sin confundirlos con un SKU exacto;
- al menos una foto propia de surtido real y representaciones de categoría
  rotuladas como `IMAGEN ILUSTRATIVA`.

La muestra se revisa primero por comprensión en teléfono y después con la
rúbrica ciega. La salida local queda en `output/image-creative-prototypes/` y se
reproduce con `pnpm image-creative:prototype`. La iteración técnica del
2026-08-11 no usa precios ni condiciones sintéticas: las medidas son sólo una
muestra de jerarquía. Queda marcada como muestra interna y no habilita una
publicación real. No se paga otra corrida de imágenes antes de aprobar esta
dirección.

La exportación anterior de seis piezas fue rechazada y no es una aprobación del
contrato visual. Los cuatro prototipos actuales son una nueva iteración para
revisar apariencia, jerarquía, copy, fotografías, recortes, CTA y comportamiento
entre formatos. La tarea `P4-T08` permanece abierta durante esa revisión.

El 2026-08-11 se generó con la skill `imagegen` un mostrador neutro como primera
exploración. El negocio también rechazó esa integración porque la imagen no
acompañaba la ficha. Las dos exploraciones posteriores con las escenas
`*-ia-v1.png` también fueron rechazadas: una grilla de seis conectores no
acompañaba la comparación y la aplicación aparentaba una unión terminada.

La muestra vigente usa `conectores-tres-medidas-ia-v2.png`, con tres conectores
T completos ordenados por escala, y `conector-preencastre-ia-v2.png`, con las
tres espigas visibles y las bocas de manguera todavía separadas. Ambas viven como
fixtures internos con procedencia documentada, se embeben en el documento de
diseño y conservan el disclaimer `IMAGEN ILUSTRATIVA`; no prueban medida, SKU,
compatibilidad, local ni stock. El 2026-08-12 se sustituyeron los rótulos de
muestra por `1/2″ · SKU 1670` y `3/4″ · SKU 1671`, hallados como `ESPIGA TEE
1/2` y `ESPIGA TEE 3/4 POLIETILENO` mediante la API comercial de Odoo. La
evidencia conserva fuente, fecha y alcance en el fixture; sólo acredita
identidad y medida, no precio, stock, compatibilidad ni la apariencia de la
escena ilustrativa.

### Etapa 4.1 — Reels code-native

Los Reels pueden reutilizar las composiciones técnicas aprobadas y animar sólo
elementos deterministas: entrada del producto, titular, precio, CTA y cierre de
marca. Esto evita generar un video con IA y reduce el consumo de tokens a cero
cuando los activos de entrada ya existen.

Remotion se evaluó como opción técnica porque renderiza video mediante React.
No se agrega aún al stack: su licencia distingue entre uso individual/equipos
pequeños y uso comercial o automatizado, por lo que primero debe confirmarse el
tamaño del equipo y el modo de render. La decisión y la frontera propuesta se
registran en
[`ADR-018`](../architecture/decisions/ADR-018-REMOTION-REELS.md).

### Etapa 5 — Reabrir la evaluación `P4-T08`

- registrar el rechazo de la muestra actual;
- ampliar dataset, rúbrica y hallazgos críticos;
- generar sólo los casos que realmente necesitan IA;
- repetir revisión comercial y visual;
- mantener Meta bloqueada hasta superar el gate completo.

No se ejecuta otra muestra humana paga hasta que el negocio revise esta
iteración y se cuente con medidas/SKU recuperados de la fuente comercial. Si un
caso posterior realmente necesita generación, su muestra sigue limitada a seis
salidas. La matriz automática de 18 casos continúa porque es local, rápida y no
consume proveedor.

## Criterios de aceptación del rediseño

- cero objetos críticos deformados;
- cero rótulos, marcas, vehículos o fachadas inventados como si fueran reales;
- todo precio coincide con snapshot y muestra condición/vigencia aplicable;
- toda representación no exacta declara `IMAGEN ILUSTRATIVA`;
- Aramayo y Frías se leen en teléfono en toda pieza comercial o promocionada;
- una persona entiende producto/categoría, uso y acción en tres segundos;
- la pieza tiene un único foco y no más de cuatro bloques de información;
- cada activo externo conserva permiso y procedencia;
- la revisión humana puede rechazar por apariencia de IA aunque lo factual sea
  correcto.

## Decisiones pendientes del negocio

1. Firma principal: `FERRETERÍA ARAMAYO · FRÍAS` o `CONSEGUÍLO EN FRÍAS`.
2. Regla de precios: contado, transferencia, unidad, IVA y vigencia visible.
3. Alcance exacto de `IMAGEN ILUSTRATIVA` para productos similares.
4. Primeros tres productos/categorías con datos vigentes para reemplazar los
   precios sintéticos de los prototipos.
5. Aprobación del contexto social persistente: audiencia, voz, plataforma y
   objetivo primario.
6. Tamaño del equipo y modalidad de render de video para resolver la licencia
   de Remotion antes de instalarlo.
