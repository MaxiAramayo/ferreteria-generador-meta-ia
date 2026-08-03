# Estado del proyecto

Actualizado: 2026-08-03

## Fase activa

**Fase 4 — Generación personalizada de imágenes**

Las Fases 0, 2 y 3 quedaron cerradas. `P1-T07` tiene la implementación local
completa y está bloqueada únicamente por las credenciales de Cloudinary staging
necesarias para su verificación remota, así que la Fase 1 sigue abierta por ese
único motivo. La continuidad local fue autorizada explícitamente mientras el
smoke remoto queda en espera.

`P4-T01` tiene la implementación completa y verificada, y queda bloqueada
únicamente por la revisión visual y comercial de los seis perfiles iniciales:
es una aprobación del negocio y no algo que el código pueda demostrar. Eso no
detiene `P4-T02`, que trabaja sobre entradas visuales y no sobre el lenguaje
visual, pero sí tiene que resolverse antes de generar una imagen real en
`P4-T03`.

## Resumen

- [x] Fase documental inicial creada.
- [x] Fase 0 — Fundación y bootstrap.
- [ ] Fase 1 — Migración del motor visual.
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

Iniciar `P4-T02` — validar y preparar entradas visuales. Sus dependencias son
`P1-T07` y `P4-T01`: la primera tiene su implementación local completa y la
segunda entrega el catálogo de perfiles y la política de activos que definen
qué entrada hace falta preparar.

`P4-T01` dejó dos cosas que `P4-T02` tiene que resolver. La primera es un
faltante concreto: la biblioteca congelada en `P1-T01` no tiene ninguna foto
propia de lubricante clasificada como material de producto —las de lubricentro
son fotos del local—, así que el perfil `lubricentro-producto-limpio` hoy sólo
puede resolverse con render determinista. La segunda es el criterio de
clasificación: la política vigente admite como referencia de producto
únicamente los activos `media` y como contexto los `brand` que no son
logotipo, y ese criterio se vuelve fino cuando entren fotos subidas por el
usuario.

`P3-T09` cerró la vertical: la ejecución tiene ciclo de vida propio, el outbox
la conecta con el worker, la API expone pedido, consulta, historial,
cancelación y aceptación, `AICreativeComposer` muestra recuperación y
generación por separado, y la revisión conserva de qué ejecución salió.

La autorización explícita del usuario habilitó únicamente la API comercial de
Odoo. No autoriza publicar contenido ni configurar proveedores reales de
OpenAI producción, Meta o Cloudinary staging.

El smoke `pnpm media:smoke:cloudinary` sigue pendiente y debe ejecutarse antes
de cerrar Fase 1.

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
  Producción continúa sin credenciales OpenAI. Meta no está configurada.
  Cloudinary local fue actualizado por el usuario, pero el ambiente staging aún
  debe confirmarse antes del smoke externo.
- Asignaciones nominales de responsables y roles se confirman al provisionar
  staging y se mantienen fuera de Git.
- Los seis perfiles visuales de `P4-T01` esperan la revisión visual y comercial
  del negocio. Están congelados en `visual-profile/2026-08-03.1` y ninguna
  imagen real se genera hasta `P4-T03`.

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

## Cómo actualizar este archivo

- Cambiar la fase activa solo cuando sus prerrequisitos estén completos.
- Marcar una fase con `[x]` únicamente cuando todas sus tareas estén `[x]`.
- Mantener una única próxima tarea principal.
- Agregar bloqueos concretos; no usar “en progreso” como bloqueo.
- Actualizar la fecha en cada cambio.
