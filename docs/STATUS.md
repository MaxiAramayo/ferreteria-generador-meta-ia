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

Hay 17 piezas compuestas de 39 registradas: las once heredadas vigentes y las
seis nuevas del catálogo propio (`producto-precio`, `combo-kit`,
`problema-solucion`, `historia-precio-dia`, `historia-turno-lubricentro` e
`historia-tip`). El precio es opcional en todas ellas.

Falta definir con el negocio el contenido del carrusel y las piezas que aún no
están en el catálogo, rehacer las cinco historias marcadas como `redesign`,
adaptar los fixtures a documentos y comparar contra las referencias.

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
