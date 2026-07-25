# Estado del proyecto

Actualizado: 2026-07-25

## Fase activa

**Fase 0 — Fundación y decisiones verificables**

## Resumen

- [x] Fase documental inicial creada.
- [ ] Fase 0 — Fundación y bootstrap.
- [ ] Fase 1 — Migración del motor visual.
- [ ] Fase 2 — Dominio, persistencia y panel base.
- [ ] Fase 3 — OpenAI, RAG y datos comerciales.
- [ ] Fase 4 — Generación personalizada de imágenes.
- [ ] Fase 5 — Publicación mediante Meta.
- [ ] Fase 6 — Programación y automatizaciones.
- [ ] Fase 7 — Endurecimiento y salida a producción.

## Próxima tarea habilitada

`P0-T06` — Establecer controles de calidad y CI.

`P0-T05` dejó panel, API y worker iniciables con `pnpm dev`, validación de
configuración antes de aceptar tráfico o trabajo, liveness y readiness
diferenciados, cierre ordenado y un smoke por aplicación. Los scripts raíz
`build`, `typecheck`, `test` y `smoke` ya existen; `P0-T06` debe agregar `lint`,
unificar las puertas de calidad y ejecutarlas en integración continua con
instalación congelada.

## Bloqueos externos conocidos

- Sistema comercial y método de acceso todavía no identificados.
- Activos y tipo de cuenta de Meta todavía no inventariados.
- Credenciales de OpenAI, Meta y Cloudinary no configuradas.
- Responsables y roles internos no confirmados.

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
