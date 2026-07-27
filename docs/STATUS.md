# Estado del proyecto

Actualizado: 2026-07-27

## Fase activa

**Fase 1 — Migración del motor visual**

`P0-T07` queda diferida por decisión del usuario: depende de elegir dominio y
cerrar decisiones con costo operativo. No bloquea la Fase 1.

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

## Próxima tarea habilitada

`P1-T04` — Migrar layouts, formatos y zonas seguras (en progreso).

Van 11 de 33 layouts: las ocho publicaciones de feed y cuadrado, el banner de
portada y la portada destacada. El registro de componentes es parcial a
propósito y un layout sin componente falla con `layout: not-registered`.

Falta migrar los nueve carruseles y los catorce layouts de historia, cerrar el
registro exhaustivo, adaptar los 33 fixtures congelados a documentos y comparar
contra las referencias PNG.

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
