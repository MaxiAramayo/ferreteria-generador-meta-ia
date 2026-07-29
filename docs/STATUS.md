# Estado del proyecto

Actualizado: 2026-07-29

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

Iniciar `P3-T03` — ingerir documentos aprobados en File Search y registrar su
ciclo de vida local/remoto. `P3-T02` quedó cerrado con pruebas de contrato y
smoke real del proyecto OpenAI staging.

En paralelo continúa `P3-T05`: completar la revisión técnica con la función
`Administrador de Odoo` usando `docs/integrations/ODOO-READ-ACCESS.md`.

La excepción de continuidad queda limitada al smoke remoto pendiente de
`P1-T07`; no autoriza publicar ni conectar proveedores reales.

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
- Sistema comercial identificado como Odoo 18 Community y custodio técnico
  designado como `Administrador de Odoo`. Se propuso XML-RPC sobre HTTPS con API
  key de usuario técnico de solo lectura; falta revisar endpoints, ACL, modelos,
  campos y mapping de sucursales con esa función.
- Activos y tipo de cuenta de Meta todavía no inventariados.
- La credencial del proyecto OpenAI staging está configurada localmente y el
  smoke real de `P3-T02` pasó. Producción continúa sin credenciales OpenAI.
  Meta no está configurada. Cloudinary local fue actualizado por el usuario,
  pero el ambiente staging aún debe confirmarse antes del smoke externo.
- Asignaciones nominales de responsables y roles se confirman al provisionar
  staging y se mantienen fuera de Git.

`P3-T05` tiene contratos, fixtures y tests locales completos, pero su revisión
obligatoria con el `Administrador de Odoo` impide cerrarla y conectar el
sistema. El Vector Store de staging todavía no existe; `P3-T03` debe crearlo y
registrar su identificador sin versionar credenciales.

## Registro de decisiones pendientes

- Validación del acceso XML-RPC, permisos y mapping con `Administrador de Odoo`.
- Política inicial de publicaciones que pueden autoaprobarse.

## Cómo actualizar este archivo

- Cambiar la fase activa solo cuando sus prerrequisitos estén completos.
- Marcar una fase con `[x]` únicamente cuando todas sus tareas estén `[x]`.
- Mantener una única próxima tarea principal.
- Agregar bloqueos concretos; no usar “en progreso” como bloqueo.
- Actualizar la fecha en cada cambio.
