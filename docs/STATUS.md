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

Continuar `P3-T01` — revisar el catálogo y ejecutar sus escenarios con un
responsable de la ferretería, sin ingerir fuentes ni conectar OpenAI. El
inventario técnico y la política borrador ya están documentados, pero su cierre
requiere confirmación de fuentes, vigencia y disclaimers.

La excepción de continuidad queda limitada al smoke remoto pendiente de
`P1-T07`; no autoriza publicar ni conectar proveedores reales.

El smoke `pnpm media:smoke:cloudinary` sigue pendiente y debe ejecutarse antes
de cerrar Fase 1.

## Bloqueos externos conocidos

- El VPS dedicado responde como `vps-f94a1dd2.vps.ovh.ca` en
  `144.217.91.115` y `2607:5300:205:200::9f41`. Su baseline de Ubuntu, SSH por
  clave, UFW, swap, Docker y directorios protegidos quedó verificado. No hay
  aplicación, base ni secretos desplegados.
- Donweb ya sirve autoritativamente los registros `A` y `AAAA` de `content` y
  `api.content`; la caché negativa de los resolvers públicos todavía producía
  respuestas parciales al verificar la propagación.
- GHCR contiene las cuatro imágenes `linux/amd64` del commit
  `3b83df4c667e8b14b3ff1e65363e6e6cf1a5ebf1`; su visibilidad o credencial de
  lectura para el VPS sigue pendiente. Backup externo tampoco está confirmado.
  El scaffolding no autoriza omitir las puertas de Fase 7.
- Sistema comercial y método de acceso todavía no identificados.
- Activos y tipo de cuenta de Meta todavía no inventariados.
- Credenciales de OpenAI y Meta no configuradas. Cloudinary local fue
  actualizado por el usuario, pero el ambiente staging aún debe confirmarse
  antes del smoke externo.
- Asignaciones nominales de responsables y roles se confirman al provisionar
  staging y se mantienen fuera de Git.

Estos bloqueos no impiden preparar el inventario y la política local de
`P3-T01`, pero el sistema comercial sin identificar y la aprobación nominal sí
limitan su evidencia de cierre.

## Registro de decisiones pendientes

- Método de acceso al sistema comercial.
- Política inicial de publicaciones que pueden autoaprobarse.

## Cómo actualizar este archivo

- Cambiar la fase activa solo cuando sus prerrequisitos estén completos.
- Marcar una fase con `[x]` únicamente cuando todas sus tareas estén `[x]`.
- Mantener una única próxima tarea principal.
- Agregar bloqueos concretos; no usar “en progreso” como bloqueo.
- Actualizar la fecha en cada cambio.
