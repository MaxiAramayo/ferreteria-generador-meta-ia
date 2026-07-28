# Estado del proyecto

Actualizado: 2026-07-28

## Fase activa

**Fase 2 — Dominio, persistencia y panel base**

La Fase 1 conserva `P1-T07` bloqueada. Mientras tanto se completaron las tareas
locales independientes `P2-T01` y `P2-T04`.

## Resumen

- [x] Fase documental inicial creada.
- [ ] Fase 0 — Fundación y bootstrap (falta `P0-T07`, diferida).
- [ ] Fase 1 — Migración del motor visual.
- [ ] Fase 2 — Dominio, persistencia y panel base.
- [ ] Fase 3 — OpenAI, RAG y datos comerciales.
- [ ] Fase 4 — Generación personalizada de imágenes.
- [ ] Fase 5 — Publicación mediante Meta.
- [ ] Fase 6 — Programación y automatizaciones.
- [ ] Fase 7 — Endurecimiento y salida a producción.

## Próximo desbloqueo requerido

No queda una tarea local habilitada sin resolver un bloqueo externo.

`P2-T01` dejó el esquema, migraciones, seed, repositorios e integración real
cerrados. `P2-T04` dejó la máquina de estados, compare-and-swap e historial
append-only cerrados.

El próximo desbloqueo es `P0-T07`: elegir dominio y cerrar identidad, ambientes
y topología. Después queda habilitada `P2-T02` —autenticación y autorización—.
`P1-T07` requiere además credenciales de Cloudinary; al cerrarla, junto con
`P2-T02` y `P2-T03`, se habilita `P2-T05`.

## Bloqueos externos conocidos

- Dominio propio o comprado todavía no definido; difiere `P0-T07`.
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
