# Estado del proyecto

Actualizado: 2026-08-17

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

Continuar `P5-T02` — OAuth y almacenamiento de conexiones. La vertical local ya
incluye `state` de un solo uso ligado a sesión y tenant, redirect fija, Graph
`v26.0`, descubrimiento de Page/Instagram, AES-256-GCM versionado, health,
renovación, revocación auditada y panel sin secretos. La migración completa pasó
up, repositorios, down y reaplicación en una base efímera. Falta la única
verificación que puede cerrar la tarea: configurar redirect y cinco permisos en
una app Meta de staging y ejecutar OAuth completo, sin crear containers ni
publicaciones. Antes hace falta provisionar un hostname staging real: el nombre
de Render de `ADR-012` sigue siendo nominal y no debe registrarse como callback.
El acceso a Meta for Developers quedó abierto para que el administrador ingrese
personalmente contraseña y 2FA. Crear/configurar la app y eventualmente generar
costo de hosting requieren confirmación concreta.

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
- **el botón de acción mide 4,38:1** y el umbral de texto normal es 4,5:1. El
  verde de WhatsApp es identidad aprobada en `P1-T06` y lo usan las dieciocho
  piezas del catálogo; cambiarlo es una decisión de marca;
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
- Si el verde de acción de la marca se corrige. Con texto blanco mide 4,38:1 y
  el umbral AA para texto normal es 4,5:1. Supera el de texto grande, que es lo
  que la composición le exige, pero queda 0,12 por debajo del general. Lo usan
  las dieciocho piezas del catálogo, así que es una decisión de marca y no un
  ajuste técnico. Surgió al medir el contraste en `P4-T05`.
- Uso de emojis en el copy de Aramayo: si se admiten, en qué destinos y con qué
  criterio. Surgió al revisar la muestra de `P3-T08`. Hasta que exista una
  política aprobada, el prompt no los pide y la evaluación no los mide.
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
