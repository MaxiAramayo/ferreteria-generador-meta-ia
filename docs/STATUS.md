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

`P0-T07` — Definir identidad, ambientes y topología de despliegue.

`P0-T06` dejó `pnpm verify` como pipeline único —formato, build, lint, tipos,
pruebas y smoke— y el mismo orden en integración continua con instalación
congelada. `P0-T07` es la última tarea de la fase: requiere decisiones con costo
operativo (dominios, callbacks, separación staging/producción y propietarios de
cada secreto), por lo que necesita aprobación explícita antes de cerrarse.

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
