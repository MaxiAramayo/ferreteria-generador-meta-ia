# Estado del proyecto

Actualizado: 2026-07-25

## Fase activa

**Fase 1 — Migración del motor visual**

`P0-T07` queda diferida por decisión del usuario: depende de elegir dominio y
cerrar decisiones con costo operativo. No bloquea la Fase 1.

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

`P1-T01` — Congelar inventario y fixtures de referencia. **En progreso.**

La línea base ya está congelada y verificada en
`packages/design-engine/baseline/`: 33 layouts inventariados, 33 fixtures y 33
PNG de referencia, con el generador intacto. Faltan dos criterios que dependen
de una decisión del usuario:

1. el árbol del generador tiene 244 rutas sin commitear, así que el snapshot se
   fijó por hash de contenido en lugar de por commit;
2. 17 fotografías no tienen origen ni permiso de uso documentado.

`P1-T02` queda habilitada recién cuando `P1-T01` cierre.

## Bloqueos externos conocidos

- Dominio propio o comprado todavía no definido; difiere `P0-T07`.
- Trabajo sin commitear en el generador visual: impide fijar el snapshot por
  commit en `P1-T01`.
- Origen y permiso de uso de 17 fotografías del generador sin confirmar.
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
