# Estado del proyecto

Actualizado: 2026-08-31

## Fase activa

**Fase 5 — Publicación mediante Meta**

Las Fases 0, 1, 2 y 3 quedaron cerradas. La Fase 1 cerró el 2026-08-03: el
usuario configuró Cloudinary staging y el smoke remoto verificó carga, variante
HTTPS, render con navegador real y borrado idempotente, que era lo único que le
faltaba a `P1-T07`.

`P4-T01` quedó cerrada. La revisión visual y comercial se hizo el 2026-08-03 y
sus decisiones están aplicadas en `visual-profile/2026-08-03.2`.

`P4-T05` quedó cerrada el 2026-08-05. El lote deja de entregar bases crudas y
entrega **piezas publicables**: la imagen del modelo es el fondo y encima se
compone la capa de marca —logo, titular, precio, vigencia y llamado a la
acción— sobre un panel opaco ubicado en el mismo rectángulo que el prompt le
pidió al modelo dejar libre. Un lote determinista también entrega pieza.

`P4-T04` quedó cerrada el 2026-08-03. Una ejecución de generación es un lote de
variantes con ciclo de vida propio —`pending → running → completed | failed |
cancelled`—, la API la encola con 202 y la deja consultable con su progreso, el
worker la resuelve con concurrencia acotada y reintento por variante, y una
cancelación impide promover el resultado tardío aunque el proveedor ya haya
respondido.

`P4-T07` quedó cerrada el 2026-08-06. La generación ahora se admite mediante
política versionada y reservas transaccionales; cada intento conserva estado,
tokens por modalidad y costo exacto en micro-USD aunque falle después de
Images. El worker aplica moderación previa y posterior fail-closed, consulta la
habilitación dinámicamente y barre huérfanos vencidos sin borrar medios
referenciados. Configuración expone cuotas, presupuesto, alerta, retenciones y
uso mensual con CAS y cortes UTC.

`P4-T06` quedó cerrada el 2026-08-06. Cada cambio crea un `GenerationRun` hijo
append-only: el visual conserva el brief y edita la base generada del padre después
de volver a verificar sus bytes; el factual exige un brief nuevo con evidencia
revalidada. El panel compara prompt, perfil, costo y resultado, y la selección
versionada conserva todas las alternativas y su auditoría (`ADR-016`).

`P4-T08` quedó cerrada el 2026-08-12 con una excepción de alcance explícitamente
aprobada por el usuario: los cuatro prototipos deterministas revisados son
aceptables y no se autoriza gastar tokens en una nueva muestra de Images. La
evaluación automática conserva 18 casos y bloquea regresiones; toda salida nueva
de Images, o cualquier cambio de prompt, perfil o modelo, obliga a reabrir el
gate con muestra ciega de seis salidas y presupuesto explícito (`ADR-017`). La
preevaluación local cubre 18
casos —seis perfiles por tres formatos— y compara producto, precio, stock, CTA y
disclaimer contra snapshots sintéticos. El usuario aportó y autorizó una foto de
los filtros Wega FCI 1101C, y la muestra real de 12 piezas se generó en staging y
quedó preparada de forma ciega en `output/image-quality-review/`. La corrida
liquidó USD 0,657 según el uso informado por Images. La inspección preliminar
detectó un fallo crítico: las piezas Wega `A03` y `A04` perdieron la marca y el
código del envase, y `A04` agregó un filtro blanco genérico. El gate sigue
bloqueado. El usuario rechazó además el filtro visual repetido y las escenas
complejas con geometría inventada. El rediseño propuesto prioriza fotos propias,
activos autorizados y representaciones de categoría claramente rotuladas;
define tres familias mínimas y vuelve obligatorio el anclaje visible en Frías
para piezas comerciales. Está documentado en
[`IMAGE-CREATIVE-IMPROVEMENT-PLAN.md`](operations/IMAGE-CREATIVE-IMPROVEMENT-PLAN.md).
La siguiente muestra ya no será de 12: el negocio la limitó a tres historias y
tres posts. Los seis prototipos code-native ya fueron renderizados con activos
propios, casos sin marca, `EN FRÍAS`, explicación, precio sintético rotulado y
CTA; no consumieron IA. Remotion quedó documentado como opción futura para
Reels deterministas, pendiente de confirmar su licencia antes de instalarlo.
Estos prototipos no están aprobados ni cierran `P4-T08`: son la primera
iteración para continuar revisando junto al negocio la apariencia general,
jerarquía, textos, elección y recorte de fotografías, tamaño del precio, CTA y
adaptación entre feed e historia. El 2026-08-11 el negocio rechazó esa primera
dirección y pidió dos piezas originales: un comparador para líneas con varias
medidas o modelos y una pieza de uso para los demás productos. La
nueva muestra de cuatro piezas —feed e historia de cada familia— no usa precios
ni medidas sintéticas. El negocio rechazó además la primera grilla y el
mostrador vacío porque la imagen no acompañaba. La iteración actual usa dos
escenas IA específicas y claramente ilustrativas. La ficha muestra tres
conectores T de espiga completos sobre el mostrador y usa `1/2″`, `3/4″` y `1″`
como medidas de muestra, sin atribuirlas todavía al surtido real de Aramayo. La
pieza de aplicación evita una instalación inventada: muestra el preencastre,
con las tres espigas visibles y las bocas de manguera separadas, y explica que
la manguera cubre la espiga por fuera. Ambas composiciones integran la fotografía
completa como superficie principal y `EN FRÍAS` se compone como una única unidad
tipográfica. El negocio aprobó esta dirección visual el 2026-08-11 con una
corrección final: se eliminó por completo el marco rojo exterior para reducir la
carga visual. Los rótulos, medidas y pasos siguen siendo deterministas. No deben
ejecutarse otra muestra paga ni avanzar con Reels hasta reabrir el gate conforme
a la excepción de `ADR-017`.

## Resumen

- [x] Fase documental inicial creada.
- [x] Fase 0 — Fundación y bootstrap.
- [x] Fase 1 — Migración del motor visual.
- [x] Fase 2 — Dominio, persistencia y panel base.
- [x] Fase 3 — OpenAI, RAG y datos comerciales.
- [x] Fase 4 — Generación personalizada de imágenes.
- [ ] Fase 5 — Publicación mediante Meta.
- [ ] Fase 6 — Programación y automatizaciones.
- [ ] Fase 7 — Endurecimiento y salida a producción.

La base local del despliegue en VPS quedó preparada y verificada el 2026-07-29:
Compose mantiene PostgreSQL/Redis privados, Caddy es el único ingreso público y
el smoke efímero validó migraciones, API, web, worker y Chromium. Esto no inicia
ni cierra tareas de Fase 7 y no representa un despliegue remoto.

## Próxima tarea

Continuar `P5-T08` — la soldadora aprobada está desplegada y provisionada, pero
**todavía no se publicó**. La versión staging
`57d6d728845fd5641385dfaa091453da714f21ce` está sana; la publicación conserva
revisión 2 aprobada, versión 6, snapshot inmutable y política exacta de Instagram
feed + Facebook Page. La revisión técnica anterior queda en el historial.

El ícono A ya está guardado en Meta y el Dashboard informa configuración
obligatoria completa sin correo. El control del navegador bloqueó ingresar con
la credencial administradora del Llavero y se pidió la autorización específica
para ese acceso. No falta aprobación comercial de la pieza. Worker detenido,
cero órdenes, cero trabajos pendientes y usuario de revisión todavía disabled.
Evidencia, rollback y próximo paso reproducible en
[`registro operativo del 31 de agosto`](operations/META-APP-REVIEW-PUBLICATION-2026-08-31.md).

El 2026-08-31 se reforzó la preparación local: generador y provisionador exigen
una huella del paquete aprobado que liga bitmap, documento de diseño, copy,
evidencia comercial, destinos y límites. Cambiar cualquiera invalida la
aprobación anterior. El usuario aprobó el paquete exacto y ordenó publicarlo
el 2026-08-31; la huella registra esa aprobación, no revalida datos comerciales. Detalles y procedimiento
en el paquete de App Review.

El usuario decidió el 2026-08-21 que App Review use la Page real de Aramayo y
`@ferreteria_aramayo`, y aprobó nombre, marca responsable, dominio, textos
legales, teléfono y domicilios. El 2026-08-22 descartó el bitmap y copy técnicos:
esa aprobación ya no es válida. También rechazó la primera candidata comercial
de herramientas eléctricas porque reutilizaba una publicación existente. La
nueva candidata muestra completa una soldadora genérica dentro de un marco
difuminado y la rotula como ilustrativa. La capa determinista informa el
producto real **LA-SER Inverter 160 A**. El 2026-08-31 el usuario pidió quitar
el importe y dejar **“Consultar precio” en tipografía normal**, explicar primero
la utilidad y nombrar Casa Central y Rivadavia sin “al momento de la
verificación”. El copy usa dos emojis y no repite “Imagen ilustrativa”, que
permanece en la pieza y su texto alternativo. La ficha oficial respalda el
formato compacto y liviano; no se agregaron prestaciones sin fuente. Odoo
confirmó seis unidades por sucursal el 2026-08-24T23:20:16Z: identidad y stock
deben revalidarse antes de publicar. Los precios históricos no se publican.
La nueva candidata de 1080×1350 tiene SHA-256
`407de4f95c8e18f4c52fa0544785f06f81fe9832de1032a3ac7e977fa0ca7d43` y
tiene aprobación concreta del usuario para una orden con Instagram feed y
Facebook Page. Odoo confirmó nuevamente identidad y seis unidades por sucursal
el 2026-08-31T14:26:40Z. La conexión Meta se revalidó sana a las 14:32:09Z. La escena existente se
conservó; esta corrección no consumió generación de imágenes.

El usuario eligió la **A de la pieza como ícono**, ya exportada desde
`AramayoMark` y aplicada al favicon local. El correo se omite salvo que Meta
lo exija; el contacto autorizado quedó fuera de Git. Estas indicaciones no
autorizaban por sí solas publicación ni envío de App Review. Posteriormente,
el usuario pidió «publica nomas, y continua»: autoriza esta pieza concreta y
la continuación de los preparativos, sin duplicados ni destinos adicionales.

La inspección del 2026-08-31 encontró el SHA
`bc9fdfcbe9a592a6eb867cfc57d7a1a02e0701f0` desplegado y sano en staging, sin
worker ni órdenes. Conserva una única muestra técnica aprobada anterior que
debe reemplazarse mediante nueva revisión, sin modificar su snapshot histórico. La app Meta `2161967167868736` persistió el nombre
**Aramayo Content Platform**, dominio, privacidad, términos, callback de
eliminación, callback de desautorización y redirect OAuth exactos. El Dashboard
expone las instrucciones públicas y el callback de eliminación como alternativas;
quedó seleccionado el callback firmado y la página pública de instrucciones
continúa disponible. La identidad temporal fue creada y auditada en estado
`disabled`, con cero sesiones y credencial sólo en el Llavero; la ventana aún no
empezó y no se transmitió a Meta.

Falta ejecutar la publicación ya aprobada; cargar el ícono público y, si Meta
lo exige para enviar, un correo de contacto; reemplazar el dataset en staging;
activar y entregar la identidad sólo bajo nueva autorización; recorrer y grabar
el guion; y enviar App Review. No se envió la revisión ni se ejecutó una
publicación. El detalle reproducible está en
[`META-APP-REVIEW.md`](integrations/META-APP-REVIEW.md).

`P5-T07` quedó cerrada el 2026-08-21 con los seis criterios y las tres
verificaciones cumplidas. Lo implementado:

- **la puerta de publicación** en funciones puras: el rol se pregunta primero
  —quien no puede publicar no se entera del estado de la conexión ni de la
  pieza—, y los destinos salen de los activos de la conexión y no de una lista
  fija;
- **confirmación en dos pasos** con preview, cuenta, destinos y el copy exacto
  del snapshot aprobado. El botón dice «Publicar…» y abre la pantalla; no
  publica;
- **doble defensa contra el doble envío**: el botón deshabilitado defiende la
  experiencia y la clave idempotente defiende el dato, conservándose entre
  reintentos del mismo intento;
- **resultado por destino en cuatro desenlaces**, nombrados además de pintados,
  con las acciones manuales que el servidor autoriza;
- **`/diseno/publicacion`**, el harness que hace auditables esos estados, que de
  otro modo sólo aparecen después de una publicación que salió mal.

- **`pnpm e2e:publishing`**, que levanta base efímera, API y panel y los recorre
  con Chrome: siete comprobaciones por rol, por estado, con doble clic, refresh
  y navegación atrás.

La auditoría encontró una sección sin nombre accesible en el workspace de
publicaciones —nunca detectada porque esa pantalla exige sesión y el auditor no
llega— y un `role="dialog"` que prometía foco atrapado y cierre con Escape sin
cumplirlos.

**Y el E2E encontró un defecto que ninguna otra prueba podía encontrar.** El
panel decidía si ofrecer el botón de publicar leyendo el listado de conexiones,
que exige `connections:manage`; el rol `publisher` no lo tiene, así que quien
está autorizado a publicar nunca veía el control. Se agregó
`GET publishing/readiness` bajo `publishing:execute`, con una respuesta
deliberadamente pobre —si se puede publicar, contra qué cuenta y a qué
destinos— para no filtrar la administración de conexiones a un rol que no la
administra. Es exactamente la clase de desincronización que una prueba del panel
con la API simulada no puede ver.

`P5-T06` quedó cerrada el 2026-08-20 con los seis criterios y las tres
verificaciones cumplidas:

- **política por categoría**: cada código de fallo se resuelve en `scheduled`,
  `manual` o `reconcile`, no en un booleano. El `retryable` de los adaptadores
  contesta otra pregunta —si conviene repetir la llamada en el acto— y
  confundirlas es lo que duplica;
- **backoff con jitter y pisos de Meta**: `rate-limit` y
  `publishing-limit-reached` no se reintentan dentro de la ventana que los
  rechazó;
- **calendario persistido** con dos `CHECK`: un destino no puede esperar el
  reintento y a una persona a la vez, y un destino publicado no puede esperar
  nada —eso es lo que impide que un barrido toque lo que ya salió—;
- **barrido de planificación** separado del publicador, para que la política
  sobreviva a un reinicio;
- **barrido de reconciliación que no publica**: todas sus llamadas son lecturas,
  así que correrlo de más no puede duplicar nada.

- **acciones manuales seguras**: la alerta se expone como lista consultable y el
  servidor decide qué se puede hacer con cada destino detenido. Un desenlace en
  duda no ofrece reintentar, y el permiso se vuelve a comprobar contra el motivo
  guardado al ejecutar.

La asimetría entre las dos redes quedó explícita: la Page nunca prueba una
ausencia, así que un destino de Facebook en duda sólo puede confirmarse; el
contenedor de Instagram sí prueba las dos cosas, pero cuando prueba que salió no
devuelve la media, y ese caso tiene estado propio para no republicarlo.

**Cablear los reintentos obligó a corregir un defecto de `P5-T05`.** La orden se
cerraba como `publish_failed` en el mismo instante en que el planificador iba a
programarle un reintento, así que ningún reintento habría corrido nunca. `failed`
dejó de alcanzar para dar por cerrado un destino: la pregunta ahora es si queda
algo que el sistema vaya a hacer solo. Y `pendingPublicationTargets` dejó de
devolver los destinos caídos, porque volver a intentarlos en cualquier reentrega
del evento tiraba el backoff recién calculado.

Abandonar un destino no reescribe su intento: uno en duda queda en duda y así se
guarda. Lo único que cambia es que la plataforma deja de intentar y la orden
puede cerrar; afirmar un fallo que nadie comprobó sería la mentira que el resto
del modelo evita.

`P5-T05` quedó cerrada el 2026-08-20. La orden multidestino existe, corre contra
PostgreSQL real y su verificación está completa:

- **regla del agregado** en `packages/domain/src/publication-publishing.ts`. Se
  calcula sobre los destinos en vez de guardarse: un campo puede quedar diciendo
  `published` sobre una orden cuyo destino falló;
- **modelo de orden, destino e intento** en Prisma, con `CHECK` que impiden
  estados imposibles —un destino publicado sin identificador remoto, un fallido
  sin código—;
- **repositorio** que cumple el ciclo de la orden y el diario de intentos sobre
  las mismas dos tablas, con la regla de secuencia en el `WHERE` del `UPDATE`;
- **API** con `publishing:execute` y clave idempotente obligatoria;
- **worker cableado**: los publicadores dejaron de estar sueltos.

**La corrida contra PostgreSQL encontró dos defectos que los dobles no podían
encontrar, y los dos estaban en el repositorio.** Ninguno se veía compilando:
`pnpm verify` estaba en verde con los dos presentes.

- **`request()` nunca pudo crear una orden.** El `create` anidado de los destinos
  pasaba `organizationId` explícito y Prisma lo deriva de la clave foránea
  compuesta de la orden padre; como argumento desconocido, la creación fallaba
  entera. TypeScript no lo vio porque el literal viaja como tipo de retorno
  inferido de un `map`, donde no corre el chequeo de propiedades excedentes.
- **La transición de estado violaba un CHECK anterior.**
  `state_transitions_approval_check` reserva `approval_snapshot_id` al comando
  `approve`, y las dos transiciones `advance` de la orden lo escribían. Se quitó
  de ambas: la orden ya guarda a qué snapshot apunta.

La migración tampoco tenía `down.sql` y `verify.ts` seguía apuntando a
`meta_connections` como última migración; las dos cosas quedaron corregidas, así
que el ciclo de revertir y reaplicar vuelve a cubrir lo último que se agregó.

**Molestia de entorno que sigue en pie y es ajena a la tarea:** `pnpm infra:up` y
el resto de los comandos `infra:*` rechazan el `.env` local por dos claves en
minúscula —`correo` y `password`, líneas 45 y 46—, porque
`tools/local-infrastructure/environment.ts` exige `^[A-Z][A-Z0-9_]*$`. No se
tocaron por parecer credenciales personales. Sacarlas del `.env` devuelve
`infra:up`, `infra:health` y `infra:down` sin tocar nada más.

`P5-T03` y `P5-T04` quedaron cerradas el 2026-08-19 con **publicación real en
los activos de Aramayo**, autorizada explícitamente por el usuario. La enmienda
de [`ADR-019`](architecture/decisions/ADR-019-EXISTING-META-ASSETS-VALIDATION.md)
registra los términos, el resultado y las dos desviaciones que implica —no hubo
snapshot aprobado ni intervino el rol `publisher`—. La excepción es puntual.

| Destino | Medio preparado | Publicación |
|---|---|---|
| Instagram feed | contenedor `17875714101627070` | `17868397647637585` |
| Facebook Page | foto `1587397383077625` | `252222471780140_1587397416410955` |

La lectura remota posterior devolvió HTTP 200 en los dos y el copy remoto
coincide carácter por carácter con el confirmado. Repetir el comando exacto
devolvió `already-published` sin crear una segunda publicación.

Seis cosas quedaron registradas para las tareas siguientes:

- **el diario tiene que escribir antes de publicar, y la corrida lo demostró por
  las malas.** El primer intento creó el contenedor de Instagram y falló al
  escribir el diario por permisos; el identificador se perdió y ese contenedor
  quedó huérfano hasta vencer. No se publicó nada porque el fallo ocurrió antes
  de publicar. Un paso más tarde, no habría habido forma de saberlo;
- **la red `backend` del stack es `internal: true`.** Llega a PostgreSQL pero no
  a internet, así que el worker que publique necesita salida explícita;
- **las variables de Cloudinary estaban vacías en staging.** Se cargaron para la
  corrida y se eliminaron después;
- **el render produce PNG e Instagram sólo admite JPEG.** Quien publique debe
  entregar la variante `meta-feed` de `MediaStorage.deliveryUrl`, que reconvierte
  y limita el lado largo a 1440 px;
- **la Page pesa 4 MB como máximo, la mitad que Instagram**, acepta cinco
  formatos, no impone proporción y exige texto;
- **un desenlace ambiguo en Facebook queda en `outcome_unknown` y espera
  decisión humana.** `page_story_id` prueba que la publicación existe, pero su
  ausencia no prueba lo contrario.

`P5-T02` quedó cerrada el 2026-08-18. El OAuth completo corrió en staging con
las imágenes del SHA `45a2f272`, la conexión quedó `healthy` con la Facebook Page
y `@ferreteria_aramayo` activos, seis permisos con cero faltantes, credencial de
usuario y token de Page cifrados por separado con llave `v1`, tres transacciones
OAuth consumidas y auditoría sin token, URL ni payload. El panel la muestra como
`LISTA PARA PUBLICAR` sin exponer credenciales.

El cierre destrabó un defecto de descubrimiento que vale recordar: `me/accounts`
devuelve una colección vacía para una Page que pertenece al portfolio y que la
persona administra por asignación de negocio, así que toda conexión terminaba en
`asset_removed` con cero activos. Se reprodujo cuatro veces, incluso desde el
Explorador de la API Graph, lo que descartó el adaptador, el consentimiento y el
tipo de diálogo. `ADR-021` resolvió resolver la Page por `META_PAGE_ID` en vez de
pedir `business_management`: el grupo Meta pasó de cuatro a cinco variables y el
descubrimiento ahora distingue un activo que Meta no expone de una caída de Meta.

Dos cosas quedaron registradas para las tareas siguientes:

- el token renovado volvió sin `expires_in`, así que la conexión no tiene
  vencimiento. El dominio ya modela `expiresAt` como opcional y la salud omite
  el chequeo cuando falta, pero `P5-T06` tiene que decidir qué hace la
  renovación programada con una credencial sin fecha;
- la cuenta de Instagram no guarda token propio: publica con el de la Page, que
  se cifra aparte. `P5-T03` depende de eso.

`P4-T05` dejó cuatro cosas registradas que conviene tener presentes al
continuar:

- **la base generada viaja embebida en el documento de diseño** (`ADR-014`), no
  como URL. Componer ocurre con los bytes en la mano, ni bien vuelven del
  proveedor: es el único momento en que existen sin pedirle una lectura al
  almacenamiento. Recomponer una variante vieja —que es de `P4-T06`— va a
  necesitar esos bytes otra vez, y ahí sí corresponde evaluar
  `MediaStorage.read()`;
- **una variante que salió lleva su pieza compuesta y se escribe junto al
  resultado.** No existe el estado «generó pero no compuso»: sería
  irrecuperable. Las variantes anteriores a la migración sí quedan sin pieza y
  no pueden tenerla;
- **el botón de acción medía 4,38:1** con la paleta original. El 2026-08-24 el
  usuario retiró el verde de WhatsApp del sistema visual: los CTA usan ahora
  rojo profundo de Aramayo —o papel/tinta sobre el tema rojo— y todos superan
  el umbral de texto normal de 4,5:1;
- **`banner-fb`, `destacada` y la región `left_column` no componen.** Un lote
  que los pida se rechaza antes de gastar.

`P4-T04` dejó dos cosas registradas para `P4-T06`:

- el transporte del lote es el outbox transaccional sobre PostgreSQL y no
  BullMQ. La plataforma no tiene BullMQ desde `P2-T06` y no se agregó una
  segunda cola para esa tarea;
- la edición con referencias no está conectada porque `MediaStorage` no expone
  lectura de bytes. Hoy un sujeto `branded` sin foto aprobada se resuelve con
  render determinista y un sujeto `generic` sí se genera. Corresponde a
  `P4-T06`;

`P4-T03` quedó cerrada el 2026-08-03. El usuario habilitó GPT Image en la
organización y el smoke real generó y editó contra staging: ambas imágenes en
1024×1536 —el tamaño que el mapeo deriva del formato `feed`— con hashes
distintos, sin texto, sin logotipo y sin figura humana.

`P4-T02` quedó cerrada. La ingesta separa el original saneado del derivado que
viaja al proveedor, quita EXIF y datos de ubicación reconstruyendo la imagen
desde sus píxeles, deriva los identificadores del contenido para que la misma
foto no se suba dos veces, y la política de activos ya acepta medios validados
de la organización además de la biblioteca congelada.

`P4-T01` dejó cuatro cosas que `P4-T02` tiene que resolver:

- una foto subida y validada de la organización puede usarse como referencia de
  generación sin aprobación extra. Lo decidió el usuario el 2026-08-03, así que
  la política tiene que dejar de admitir sólo la biblioteca congelada;
- el EXIF se quita en el ingreso, también del original: la plataforma no
  almacena ubicación ni datos de cámara. Se conserva la orientación aplicada a
  los píxeles, el color se normaliza a sRGB y se guardan los dos SHA-256 —el de
  los bytes recibidos y el del archivo normalizado— para no perder trazabilidad;
- la muestra humana ya dispone de una foto de producto Wega autorizada por el
  usuario. El dataset automático conserva el caso sintético de lubricante; no se
  debe usar la foto de filtros como evidencia de un lubricante;
- las tres fotos de la gata pasan la preparación como `mascot_photo`, pero
  todavía no están persistidas: la ingesta necesita PostgreSQL y una membresía
  real, así que subirlas es una operación de datos y no de código. La biblioteca
  congelada en `P1-T01` no es alternativa: `pnpm assets:sync` la verifica contra
  hashes y no admite material nuevo.

Las fotos de producto de marca que el negocio consiga de los fabricantes no son
material propio: cada una necesita registrar con qué permiso se usa, porque la
biblioteca exige declarar propiedad en `ownershipNote`.

`P3-T09` cerró la vertical: la ejecución tiene ciclo de vida propio, el outbox
la conecta con el worker, la API expone pedido, consulta, historial,
cancelación y aceptación, `AICreativeComposer` muestra recuperación y
generación por separado, y la revisión conserva de qué ejecución salió.

La autorización explícita del usuario habilitó la API comercial de Odoo y
Cloudinary staging. No autoriza publicar contenido ni configurar proveedores
reales de OpenAI producción ni de Meta.

## Bloqueos externos conocidos

- El VPS dedicado responde como `vps-f94a1dd2.vps.ovh.ca` en
  `144.217.91.115` y `2607:5300:205:200::9f41`. Su baseline de Ubuntu, SSH por
  clave, UFW, swap, Docker y directorios protegidos quedó verificado. Hay
  imágenes precargadas, pero no contenedores, base ni volúmenes iniciados.
- Donweb ya sirve autoritativamente los registros `A` y `AAAA` de `content` y
  `api.content`; 1.1.1.1 y 8.8.8.8 ya responden consistentemente los cuatro.
- GHCR contiene las cuatro imágenes `linux/amd64` del commit
  `3b83df4c667e8b14b3ff1e65363e6e6cf1a5ebf1`. Los paquetes son públicos y el
  VPS descargó la topología completa sin credencial GHCR; no se iniciaron
  contenedores ni volúmenes. Backup externo todavía no está confirmado. El
  scaffolding no autoriza omitir las puertas de Fase 7.
- El entorno remoto `production.env` existe con modo `0600 root:root`, correo
  ACME y secretos internos generados en el host. OpenAI, Cloudinary y Meta
  permanecen vacíos; Compose validó el archivo sin exponer sus valores.
- Activos y tipo de cuenta de Meta todavía no inventariados.
- La credencial y el vector store del proyecto OpenAI staging están
  configurados localmente; los smokes reales de `P3-T02` y `P3-T03` pasaron.
  Producción continúa sin credenciales OpenAI. Meta no está configurada. GPT
  Image quedó habilitado en la organización de staging el 2026-08-03.
- Asignaciones nominales de responsables y roles se confirman al provisionar
  staging y se mantienen fuera de Git.
- Cloudinary staging quedó verificado el 2026-08-03 sobre el cloud `m73l9k4c`,
  carpeta `aramayo-posts/staging`. Su biblioteca estaba vacía al configurarlo,
  pero no está confirmado si ese cloud es exclusivo de pruebas o comparte cuenta
  con material real. Mientras no se confirme, la separación efectiva es la
  carpeta: el smoke la exige con un segmento `staging` y rechaza correr fuera de
  `NODE_ENV=staging`, pero la misma clave alcanza al resto del cloud.

`P3-T08` dejó una consecuencia registrada: la primera evaluación real reprobó y
mostró que el prompt nunca declaraba las ventanas de frescura, así que el modelo
citaba precios vencidos y la validación frenaba el run completo. El prompt pasó
a `content-brief/2026-07-30.2` con esa política y con la obligación de declarar
un dato consultado que la herramienta no pudo dar.

`P3-T07` quedó cerrado. El brief se valida contra un ledger que arma el
servidor: cada hecho cita evidencia existente, del tipo correcto y vigente, y un
fallo no produce brief. El smoke contra la Responses API real verificó los tres
caminos —sustentado, evidencia vencida y evidencia ausente— con salida
estructurada estricta y ciclo de function calling. Se ejecutó con los fixtures
aprobados en `P3-T05`; el acceso comercial real ya tenía su smoke en `P3-T06` y
su token no queda persistido localmente.

`P3-T06` quedó cerrado. El worker consume el addon
`ferreteria_content_api` 18.0.1.0.1 mediante cinco funciones estrictas y una API
HTTPS acotada, `GET`-only y con token independiente. El scope de organización y
sucursal se resuelve en el servidor, las respuestas se minimizan y cada llamada
queda auditada. El smoke real confirmó búsqueda, detalle, precio, stock y cuatro
eventos de auditoría; un `POST` controlado respondió `403`. El Vector Store de
staging ya existe y su identificador quedó registrado únicamente en el entorno
local ignorado por Git.

## Registro de decisiones pendientes

- Política inicial de publicaciones que pueden autoaprobarse.
- Qué presentación recibe un brief aceptado. Hoy la aceptación crea la revisión
  con un diseño fijo —historia tipográfica, tema taller— armado en el cliente
  web. Desde `P4-T05` existe un compositor en el servidor que sabe armar la
  pieza desde el brief; usarlo acá es la decisión que falta, y el usuario
  resolvió el 2026-08-05 dejarla fuera de esa tarea. Surgió al cerrar `P3-T09`.
- El usuario admitió pocos emojis en Instagram/Facebook el 2026-08-31; la
  candidata usa dos. Falta trasladar esa preferencia al prompt y su evaluación
  en una tarea específica; no se cambiaron modelo ni prompt en App Review.
- Qué perfil visual corresponde cuando el brief combina una dirección de
  ferretería con la marca del lubricentro. Son campos independientes y ambos
  validan, así que la combinación existe. Hoy se elige el contexto propio de la
  marca —el escenario donde esa marca sí trabaja— porque mostrar un banco de
  ferretería en una pieza del lubricentro sería mostrar un lugar donde ese
  trabajo no ocurre. Surgió al cerrar `P4-T01`.
- De dónde sale la señal que distingue un producto de marca de uno genérico.
  `subjectKind` ya separa los dos casos y por defecto asume `branded`, que exige
  foto real; falta decidir si lo declara quien edita, si lo deriva el catálogo
  comercial o si se resuelve por categoría. Surgió en la revisión de `P4-T01`.

## Cómo actualizar este archivo

- Cambiar la fase activa solo cuando sus prerrequisitos estén completos.
- Marcar una fase con `[x]` únicamente cuando todas sus tareas estén `[x]`.
- Mantener una única próxima tarea principal.
- Agregar bloqueos concretos; no usar “en progreso” como bloqueo.
- Actualizar la fecha en cada cambio.
