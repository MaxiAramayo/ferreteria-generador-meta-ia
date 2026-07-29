# Estado del proyecto

Actualizado: 2026-07-29

## Fase activa

**Fase 2 — Dominio, persistencia y panel base**

La Fase 0 quedó cerrada. `P1-T07` tiene la implementación local completa y está
bloqueada únicamente por las credenciales de Cloudinary staging necesarias
para su verificación remota. En Fase 2 están completas `P2-T01` a `P2-T07`; la
continuidad local fue autorizada explícitamente mientras el smoke remoto queda
en espera.

## Resumen

- [x] Fase documental inicial creada.
- [x] Fase 0 — Fundación y bootstrap.
- [ ] Fase 1 — Migración del motor visual.
- [ ] Fase 2 — Dominio, persistencia y panel base.
- [ ] Fase 3 — OpenAI, RAG y datos comerciales.
- [ ] Fase 4 — Generación personalizada de imágenes.
- [ ] Fase 5 — Publicación mediante Meta.
- [ ] Fase 6 — Programación y automatizaciones.
- [ ] Fase 7 — Endurecimiento y salida a producción.

## Próxima tarea

Iniciar `P2-T08` — completar la vertical determinista de borrador, render,
revisión y aprobación. La excepción de dependencia queda limitada al smoke
remoto pendiente de `P1-T07`; no autoriza publicar ni conectar proveedores
reales.

El smoke `pnpm media:smoke:cloudinary` sigue pendiente y debe ejecutarse antes
de cerrar Fase 1.

## Bloqueos externos conocidos

- Dominio propio no definido; no bloquea el piloto con hostnames de Render y se
  reevalúa en Fase 7.
- Sistema comercial y método de acceso todavía no identificados.
- Activos y tipo de cuenta de Meta todavía no inventariados.
- Credenciales de OpenAI, Meta y Cloudinary no configuradas.
- Asignaciones nominales de responsables y roles se confirman al provisionar
  staging y se mantienen fuera de Git.

Estos bloqueos no impiden completar la parte local de Fase 0 ni Fase 1.

## Registro de decisiones pendientes

- Método de acceso al sistema comercial.
- Política inicial de publicaciones que pueden autoaprobarse.

## Cómo actualizar este archivo

- Cambiar la fase activa solo cuando sus prerrequisitos estén completos.
- Marcar una fase con `[x]` únicamente cuando todas sus tareas estén `[x]`.
- Mantener una única próxima tarea principal.
- Agregar bloqueos concretos; no usar “en progreso” como bloqueo.
- Actualizar la fecha en cada cambio.
