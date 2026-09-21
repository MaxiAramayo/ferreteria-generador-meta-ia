# ADR-030: historias recurrentes con firma de marca y marcos por regla

- Estado: aceptado
- Fecha: 2026-09-17
- Actualizada: 2026-09-19
- Tareas: `P6-T10`, `P6-T11`, `P6-T12`, `P6-T13`

## Contexto

Una regla recurrente de apertura ya puede materializar un borrador citable con
el horario y la dirección vigentes. Sin embargo, el panel sólo crea reglas, la
vista previa es una aproximación separada del render y la regla siempre genera
el mismo `historia-tip`. Quien opera no puede ajustar una regla existente, ver
qué aspecto tendrá cada día ni distinguir «activar la regla» de publicar en
Instagram.

La identidad no puede depender de que cada layout recuerde escribir el mismo
nombre, logo o ciudad. Eso produce piezas inconsistentes y convierte «Frías»
en un texto fijo incluso si el alcance factual cambia. Para una rutina de
apertura, además, una foto inventada o generada aporta poco y puede confundir:
el hecho que se comunica es horario y ubicación actuales.

La primera iteración también pidió elegir una rotación para cada día de la
semana. Eso duplica el selector de días de la propia regla: para alternar dos
historias, una persona puede crear dos reglas con días distintos. Además, la
previsualización aproximada del panel no era el documento que renderiza el
worker, por lo que no servía como control antes de aprobar.

## Decisión

1. La apertura tendrá tres layouts deterministas y compatibles con el mismo
   contrato factual: `cartel`, `horario` y `locales`. Cada uno muestra la firma
   de Ferretería Aramayo, título, horario, ubicación y CTA dentro de las zonas
   seguras de `historia`.
2. El motor compone una firma de marca desde `LayoutContext`: isotipo, nombre de
   marca y localidad. La ciudad no es una constante de un layout. Las piezas
   que ya expresan su propia firma conservan una única marca visible.
3. Cada regla conserva un único estilo: una variante de composición y un tema
   de Ferretería Aramayo. Todos sus días seleccionados generan ese mismo estilo.
   Para alternar historias se crean reglas independientes con sus respectivos
   días; no existe una rotación día por día. La persistencia mantiene la forma
   heredada sólo como compatibilidad de despliegue, pero la API y el dominio ya
   no exponen ni aceptan esa rotación.
4. Editar una regla es un comando con versión esperada, idempotencia y
   auditoría. Cambia sólo materializaciones futuras: una revisión ya aprobada,
   una programación y una publicación son evidencia histórica y no se
   reescriben.
5. La rutina mantiene el circuito de `ADR-025`: activar guarda una intención;
   materializar crea un borrador; renderizar produce el PNG; aprobar programa;
   el worker valida y publica sólo con una orden autorizada. Una conexión Meta
   degradada, un feriado, un cierre o una fuente modificada bloquean la salida.
6. La vista previa de la regla compone el mismo `DesignPiece` que utiliza el
   renderer, escalado a la interfaz; no replica el layout con CSS separado. Los
   tres layouts incorporan un fondo determinista de chapa y trama a partir del
   tema aprobado. La prohibición de fotografías que tenía este punto la
   reemplaza el punto 8: una foto real sí, una generada no.
7. Un borrador materializado puede editarse antes de renderizar y aprobar: copy
   visible, marco/posición mediante las tres variantes y tema aprobado. Guardar
   siempre agrega una revisión de borrador con compare-and-swap; no modifica el
   snapshot aprobado, una programación ni una publicación.

### Enmienda del 2026-09-19: foto propia e imagen propia (`P6-T12`)

El usuario pidió que la apertura se pareciera a una historia de referencia —la
mascota del local en el mostrador, fondo rojo, titular enorme, sucursales y
WhatsApp— y poder subir su propia imagen en vez de elegir sólo entre los
diseños del sistema.

8. Las tres composiciones llevan una foto real: la propia de la regla o, sin
   ella, la foto del local de la biblioteca de marca. Nunca una generada. La
   foto no dibuja datos: horario, sucursales y teléfono los compone el motor
   desde la fuente factual, sobre una franja cuyo texto mide al menos 4,5:1
   (el blanco sobre el rojo de marca mide 4,19:1; sobre el rojo profundo,
   6,31:1).
9. «Imagen propia» (`historia-apertura-imagen`) publica tal cual una imagen que
   armó quien opera. El sistema no puede leer lo que esa imagen afirma, así que
   su borrador siempre exige aprobación humana, aunque la regla sea automática.
   El caption, la validación previa y la invalidación por cambio de horario
   siguen saliendo de la fuente factual; la imagen, en cambio, no se corrige
   sola si el horario cambia.
10. La foto se prepara en el navegador —hasta 1440×2560, JPEG, sin metadatos,
    lo que también quita la ubicación GPS de una foto de celular— y se guarda
    embebida como `data:` en la regla y en cada borrador. Se guarda un tercio
    más grande que la historia para que acercarla en el panel siga mostrando
    píxeles de verdad; el costo es una copia de 0,4 a 1,5 MB por borrador. Se prefirió a un
    `MediaAsset` en Cloudinary porque no necesita un circuito asíncrono nuevo
    ni llevar credenciales de Cloudinary fuera del worker, y porque el
    documento embebido se recompone igual aunque la URL cambie. El costo es esa
    copia por borrador y respuestas idempotentes de hasta 4 MB. La API acepta cuerpos de hasta 4 MB sólo en las rutas que llevan
    la foto; el resto conserva 100 KB, incluido el login. La API y el motor
    comprueban que los bytes sean de verdad el JPEG o PNG que declaran. Se
    revisa si entra otra persona a operar o si la base crece más de lo
    previsto.
11. El color de la etiqueta de estado y del botón es una elección de la regla:
    `marca` (la del tema, por defecto), `senal` (amarillo) o `verde`. El verde
    `#1e7d3f` entra a la paleta sólo para esas dos señales: mide 5,17:1 con
    texto blanco y, sobre el rojo, lleva borde blanco porque verde y rojo casi
    no se distinguen en luminancia (1,23:1).
12. El copy de la apertura es «¡Ya abrimos!». La etiqueta dice «Abierto hoy»,
    que es cierto todo el día aunque la historia siga visible en el cierre del
    mediodía. El saludo sigue la hora civil de la publicación —«Buen día»,
    «Buenas tardes» o «Buenas noches»— con la localidad cuando entra, y «tu
    auto» sólo se promete en una historia de todas las sucursales.

### Enmienda del 2026-09-19: lubricentro, marcos intercambiables y encuadre (`P6-T13`)

El dueño pidió tres cosas después de ver las aperturas: recordar el servicio de
lubricentro algunos días, ordenar la apertura por jerarquía —marca, mensaje,
rubros, diferenciales, datos prácticos y un botón grande— y poder cambiar el
marco y mover la foto cuando queda cortada, «a medida que vaya poniendo otras
imágenes».

13. Una regla recurrente declara qué historia arma: `apertura` o `lubricentro`.
    La historia decide el copy, la paleta y los marcos disponibles; el
    mecanismo —materializar, revisar, aprobar, publicar— es el mismo. El
    lubricentro funciona únicamente en casa central (`KN-004`), así que su regla
    nombra una sucursal concreta y nunca «todas»: lo comprueban el servicio y un
    `CHECK` de la tabla.
14. Cada historia ofrece marcos que dejan libre una zona distinta de la foto,
    con la misma idea que la familia de `ADR-029`: quien opera elige el que no
    tapa lo que importa de su imagen. La apertura ofrece «foto al medio»
    (`cartel`), «placa abajo» (`placa`), «tarjeta arriba a la derecha»
    (`esquina`) e «imagen propia»; el lubricentro, «foto enmarcada»
    (`ventana`), `placa`, `esquina` e «imagen propia». El identificador del
    layout nombra historia y marco —`historia-<historia>-<marco>`—, así que un
    borrador dice con qué se compuso sin mirar la regla. `horario` y `locales`
    quedan como marcos heredados: siguen registrados y componen con la
    plantilla estable.
15. El encuadre viaja con la foto: `focusX`, `focusY` —el punto de la imagen
    que queda fijo, de 0 a 100— y `zoom`, en porcentaje de 100 a 250. El panel
    lo edita arrastrando la foto sobre la vista previa real y con una barra para
    acercar; las flechas del teclado hacen lo mismo. Acercar es lo que crea
    lugar para mover: una foto con la misma proporción que la historia no tiene
    sobrante al 100 %.
16. La apertura sigue la jerarquía que definió el dueño: marca y saludo,
    «¡Ya abrimos!», una línea chica con dónde se atiende, seis rubros con
    ícono, tres diferenciales en chico, las sucursales con el horario y un botón
    grande «¿Buscás algo? Escribinos» con el teléfono. La etiqueta «Abierto hoy»
    se quita: repetía lo que ya dice el titular. Los seis rubros salen de los
    que comercializa el negocio (`KN-004`) y los tres diferenciales son
    afirmaciones del dueño, registradas acá porque no se deducen de la base.
17. El lubricentro afirma «¿Toca el service?», «Cambio de aceite con fosa en
    <dirección>» —la calle, no el nombre de la sucursal—, sus productos
    (lubricantes, filtros y baterías), los vehículos que atiende y el horario
    vigente de esa sucursal, con el botón «Pedí tu turno»: el turno se toma por
    WhatsApp o en el local (`KN-002`). Sin foto propia usa la del mostrador de
    lubricantes de la biblioteca.
18. Los datos de un marco se apoyan en una tarjeta que no llega al borde del
    lienzo: la foto sigue detrás y debajo. Con la tarjeta abajo del todo, de una
    foto vertical se ven la cara y las patas de la gata, y del taller, el piso
    y la fosa. Es lo que pidió el dueño el 2026-09-20: «que la gata se vea
    bien», porque ocupa la mayor parte de la historia.
19. Ninguna pieza rotula su foto como ilustrativa. Es una decisión del dueño del
    2026-09-19: la aclaración le resta a la historia y la foto es material suyo,
    no una afirmación del sistema.

## Consecuencias

- La variación no inventa copy ni hechos: cambia composición o tema, no el
  horario ni la información de sucursal.
- Dos reglas del lubricentro con días distintos —una con la foto de la camioneta
  en la fosa y otra con la moto— se resuelven eligiendo marco y encuadre, sin
  pedir un diseño nuevo por cada foto.
- La persona que opera puede crear «Apertura general» para lunes a miércoles y
  «Apertura de sucursales» para jueves a sábado, sin repetir una elección por
  cada día ni convertir domingo en una ausencia silenciosa.
- La firma visual queda cubierta por una prueba estructural y las tres
  variantes entran a la regresión visual del worker.
- Una publicación real continúa necesitando autorización concreta y deja los
  identificadores remotos para `P5-T09` y `P6-T09`.

## Alternativas descartadas

- **Cambiar el layout ya materializado**: altera una pieza que pudo ser
  aprobada o programada y rompe su snapshot.
- **Mantener la rotación diaria**: repite un dato que ya expresa el conjunto de
  días de una regla y oculta que dos piezas distintas requieren dos reglas.
- **Exponer todo el catálogo de historias**: mezcla layouts de producto,
  precios o lubricentro con una afirmación de horario y permite composiciones
  inválidas.
- **Pedir una imagen generada todos los días**: agrega costo, dependencia y
  riesgo visual a una comunicación que debe ser factual y rápida.
- **Guardar la foto propia como `MediaAsset` en Cloudinary**: es el camino de
  los medios controlados, pero hoy exige un circuito API → worker con estados
  de carga para una sola persona operando. Queda como el paso siguiente si la
  copia por borrador pesa (punto 10).
- **Leer el texto de la imagen propia para validarlo**: agregaría un
  proveedor y una afirmación automática sobre lo que dice una imagen; la
  aprobación humana obligatoria resuelve lo mismo sin inventar certeza.
- **Un marco por historia y recortar la foto al subirla**: obliga a preparar
  cada imagen afuera y deja la pieza a merced de dónde caiga el motivo. Los
  marcos con encuadre resuelven el mismo problema dentro del panel.
- **Barras de horizontal y vertical en vez de arrastrar**: es más fácil de
  construir, pero mover una foto es un gesto, no dos números. Las barras
  quedaron para el acercamiento y las flechas del teclado cubren el mismo
  ajuste sin mouse.
- **Un layout por marco sin nombrar la historia**: ahorra identificadores, pero
  un borrador del lubricentro compuesto como `historia-apertura-placa` miente
  sobre lo que es en los registros y en la base.
