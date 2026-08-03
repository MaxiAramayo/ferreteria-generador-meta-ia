# Estado del proyecto

Actualizado: 2026-08-03

## Fase activa

**Fase 4 — Generación personalizada de imágenes**

Las Fases 0, 1, 2 y 3 quedaron cerradas. La Fase 1 cerró el 2026-08-03: el
usuario configuró Cloudinary staging y el smoke remoto verificó carga, variante
HTTPS, render con navegador real y borrado idempotente, que era lo único que le
faltaba a `P1-T07`.

`P4-T01` quedó cerrada. La revisión visual y comercial se hizo el 2026-08-03 y
sus decisiones están aplicadas en `visual-profile/2026-08-03.2`.

## Resumen

- [x] Fase documental inicial creada.
- [x] Fase 0 — Fundación y bootstrap.
- [x] Fase 1 — Migración del motor visual.
- [x] Fase 2 — Dominio, persistencia y panel base.
- [x] Fase 3 — OpenAI, RAG y datos comerciales.
- [ ] Fase 4 — Generación personalizada de imágenes.
- [ ] Fase 5 — Publicación mediante Meta.
- [ ] Fase 6 — Programación y automatizaciones.
- [ ] Fase 7 — Endurecimiento y salida a producción.

La base local del despliegue en VPS quedó preparada y verificada el 2026-07-29:
Compose mantiene PostgreSQL/Redis privados, Caddy es el único ingreso público y
el smoke efímero validó migraciones, API, web, worker y Chromium. Esto no inicia
ni cierra tareas de Fase 7 y no representa un despliegue remoto.

## Próxima tarea

Iniciar `P4-T04` — orquestar ejecuciones asíncronas de generación. Sus
dependencias `P2-T06` y `P4-T03` están completas.

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
- faltan fotos propias de lubricante clasificadas como material de producto: las
  de lubricentro son del local, así que `lubricentro-producto-limpio` hoy sólo
  puede resolverse con render determinista;
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
  con un diseño fijo —historia tipográfica, tema taller— porque la pieza visual
  es de Fase 4. El copy sí sale del brief. Surgió al cerrar `P3-T09`.
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
