# Estado del proyecto

Actualizado: 2026-07-30

## Fase activa

**Fase 3 — OpenAI, RAG y datos comerciales**

La Fase 0 quedó cerrada. `P1-T07` tiene la implementación local completa y está
bloqueada únicamente por las credenciales de Cloudinary staging necesarias
para su verificación remota. La Fase 2 quedó cerrada con un flujo determinista
desde borrador hasta snapshot aprobado. La continuidad local fue autorizada
explícitamente mientras el smoke remoto queda en espera.

## Resumen

- [x] Fase documental inicial creada.
- [x] Fase 0 — Fundación y bootstrap.
- [ ] Fase 1 — Migración del motor visual.
- [x] Fase 2 — Dominio, persistencia y panel base.
- [ ] Fase 3 — OpenAI, RAG y datos comerciales.
- [ ] Fase 4 — Generación personalizada de imágenes.
- [ ] Fase 5 — Publicación mediante Meta.
- [ ] Fase 6 — Programación y automatizaciones.
- [ ] Fase 7 — Endurecimiento y salida a producción.

La base local del despliegue en VPS quedó preparada y verificada el 2026-07-29:
Compose mantiene PostgreSQL/Redis privados, Caddy es el único ingreso público y
el smoke efímero validó migraciones, API, web, worker y Chromium. Esto no inicia
ni cierra tareas de Fase 7 y no representa un despliegue remoto.

## Próxima tarea

Continuar `P3-T09` — el flujo conversacional avanza por cortes verticales. El
corte 1 está cerrado y verificado: la ejecución del brief tiene ciclo de vida
propio, la API puede reservarla y una cancelación impide que un resultado tardío
quede vigente. Sigue el corte 2: el tópico de outbox que encola el pedido y el
consumidor del worker que lo ejecuta. Después vienen la API, la UI
`AICreativeComposer` y los E2E.

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
- Uso de emojis en el copy de Aramayo: si se admiten, en qué destinos y con qué
  criterio. Surgió al revisar la muestra de `P3-T08`. Hasta que exista una
  política aprobada, el prompt no los pide y la evaluación no los mide.

## Cómo actualizar este archivo

- Cambiar la fase activa solo cuando sus prerrequisitos estén completos.
- Marcar una fase con `[x]` únicamente cuando todas sus tareas estén `[x]`.
- Mantener una única próxima tarea principal.
- Agregar bloqueos concretos; no usar “en progreso” como bloqueo.
- Actualizar la fecha en cada cambio.
