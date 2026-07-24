# Fase 6 — Programación y automatizaciones

## Resultado de la fase

Publicaciones aprobadas pueden programarse una vez o mediante reglas recurrentes,
materializarse con anticipación y publicarse a la hora correcta, con locks,
idempotencia, validación previa, alertas y control humano.

## Invariantes

- PostgreSQL es la fuente de verdad del calendario.
- Toda fecha se almacena en UTC junto con la zona horaria de negocio.
- Una recurrencia crea ocurrencias concretas; no publica directamente.
- El worker vuelve a validar aprobación, conexión y activos antes de publicar.
- No hay automatización basada en compras reales hasta integrar ese sistema.

## P6-T01 — Modelar programación, recurrencia y ocurrencias

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P2-T04`, `P5-T05`
- Riesgo: Alto

### Objetivo

Representar programaciones únicas, reglas recurrentes, excepciones y ejecuciones
sin confundir la intención temporal con la orden de publicación.

### Entregables

- Entidades y migraciones.
- Estados y restricciones.
- Cálculo de próxima ocurrencia.

### Criterios de aceptación

- [ ] Se guarda instante UTC y zona IANA original.
- [ ] Una programación referencia snapshot aprobado y destinos.
- [ ] Una regla recurrente tiene vigencia, frecuencia y política de excepción.
- [ ] Cada ocurrencia tiene identidad estable e idempotente.
- [ ] Editar una regla no reescribe ocurrencias ya publicadas.
- [ ] Cancelación y expiración conservan historial.

### Verificación obligatoria

- [ ] Tests de cambio de día, mes, año y zona horaria.
- [ ] Casos de regla editada, pausada, cancelada y expirada.
- [ ] Migración y restricciones de unicidad.

### Fuera de alcance

- Despachar trabajos.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P6-T02 — Implementar dispatcher persistente

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P6-T01`
- Riesgo: Alto

### Objetivo

Detectar ocurrencias vencidas en PostgreSQL y encolarlas sin perder trabajos ni
depender de timers residentes en memoria.

### Entregables

- Dispatcher periódico.
- Selección transaccional de vencidas.
- Métricas de lag y backlog.

### Criterios de aceptación

- [ ] Un reinicio no pierde ocurrencias.
- [ ] Dos dispatchers no reclaman la misma ocurrencia simultáneamente.
- [ ] Solo estados habilitados y dentro de ventana se encolan.
- [ ] La marca de despacho y evento outbox son atómicos.
- [ ] Backlog y atraso quedan observables.
- [ ] Redis vacío puede reconstruirse desde la base.

### Verificación obligatoria

- [ ] Ejecutar dos instancias concurrentes.
- [ ] Vaciar Redis de prueba y recuperar trabajos pendientes.
- [ ] Simular caída entre selección, commit y enqueue.

### Fuera de alcance

- Llamar a Meta directamente.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P6-T03 — Ejecutar publicaciones con locks e idempotencia

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T06`, `P6-T02`
- Riesgo: Alto

### Objetivo

Consumir ocurrencias y crear/reusar órdenes de publicación con exclusión
concurrente y recuperación segura.

### Entregables

- Job de publicación programada.
- Lock con expiración y heartbeat.
- Clave idempotente por ocurrencia/destino.

### Criterios de aceptación

- [ ] Solo un worker posee una ocurrencia a la vez.
- [ ] Un lock abandonado puede recuperarse sin duplicar publicación.
- [ ] Reentrega del job devuelve la orden existente.
- [ ] El estado final deriva de intentos reales por destino.
- [ ] Un proceso terminado durante Meta se reconcilia antes de reintentar.
- [ ] La ocurrencia registra timestamps planificado, iniciado y finalizado.

### Verificación obligatoria

- [ ] Workers concurrentes sobre la misma ocurrencia.
- [ ] Terminación forzada en cada punto crítico.
- [ ] Reentrega masiva y confirmación de ausencia de duplicados.

### Fuera de alcance

- Generar automáticamente contenido recurrente.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P6-T04 — Materializar historias recurrentes

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P3-T07`, `P4-T05`, `P6-T01`
- Riesgo: Alto

### Objetivo

Convertir reglas como “Ya abrimos” en borradores concretos con fecha, ubicación,
horario vigente, preview y aprobación según política.

### Entregables

- `RecurringStoryComposer` funcional.
- Materializador con ventana de anticipación.
- Plantillas y reglas de aprobación.

### Criterios de aceptación

- [ ] Cada ocurrencia genera un borrador versionado, no una publicación invisible.
- [ ] Horario y ubicación se consultan al materializar y se citan.
- [ ] Excepciones de feriado impiden mensajes incorrectos.
- [ ] Cambios posteriores de horario invalidan borradores aún no publicados.
- [ ] La política define si requiere aprobación humana en cada ciclo.
- [ ] El preview respeta formato story y safe zones.

### Verificación obligatoria

- [ ] Casos normal, feriado, horario especial, ubicación cerrada y dato faltante.
- [ ] Cambiar horario luego de materializar y comprobar invalidación.
- [ ] E2E regla–borrador–aprobación–ocurrencia.

### Fuera de alcance

- Disparadores por compras o stock real.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P6-T05 — Validar nuevamente antes de publicar

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P6-T03`, `P6-T04`
- Riesgo: Alto

### Objetivo

Evitar publicaciones vencidas o imposibles mediante una validación justo antes
del envío externo.

### Entregables

- `PrePublishValidator`.
- Códigos de bloqueo accionables.
- Política de vigencia por tipo de dato.

### Criterios de aceptación

- [ ] Confirma snapshot aprobado y no invalidado.
- [ ] Confirma conexión, permiso y destino saludables.
- [ ] Confirma acceso y formato del medio.
- [ ] Revalida precio, stock, promoción y horario cuando corresponda.
- [ ] Un cambio material bloquea y solicita nueva revisión.
- [ ] Una falla de validación no consume intento remoto.

### Verificación obligatoria

- [ ] Casos de token revocado, medio ausente y evidencia vencida.
- [ ] Cambiar precio/stock después de aprobar.
- [ ] Confirmar código, alerta y estado correctos.

### Fuera de alcance

- Corregir automáticamente datos materiales.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P6-T06 — Construir calendario y gestión de programación

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P6-T01`, `P6-T05`
- Riesgo: Medio

### Objetivo

Permitir crear, mover, pausar y cancelar programaciones con preview del tiempo
local y consecuencias explícitas.

### Entregables

- Vista calendario/lista.
- Formularios de programación única y recurrente.
- Historial y detalle de ocurrencias.

### Criterios de aceptación

- [ ] El usuario siempre ve fecha, hora y zona.
- [ ] Cambiar una regla explica qué ocurrencias se modificarán.
- [ ] No se programa una pieza no aprobada o en el pasado fuera de tolerancia.
- [ ] Conflictos de versión no sobrescriben cambios ajenos.
- [ ] Estados vacío, cargando, error, bloqueado y parcial son explícitos.
- [ ] La UI es operable por teclado y usable en móvil.

### Verificación obligatoria

- [ ] E2E crear–mover–pausar–reanudar–cancelar.
- [ ] Prueba en dos zonas horarias del navegador.
- [ ] Auditoría de accesibilidad.

### Fuera de alcance

- Analítica de mejores horarios.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P6-T07 — Implementar alertas y reconciliación operativa

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P6-T03`, `P6-T05`
- Riesgo: Alto

### Objetivo

Detectar atraso, bloqueo, fallo definitivo, credencial degradada y divergencia
remota con mensajes accionables.

### Entregables

- Reglas de alerta.
- Bandeja operativa.
- Jobs de reconciliación temporal y remota.

### Criterios de aceptación

- [ ] Alertas incluyen publicación, destino, causa y acción segura.
- [ ] No incluyen tokens ni payloads sensibles.
- [ ] Se deduplican sin ocultar recurrencias reales.
- [ ] La resolución queda auditada.
- [ ] El sistema identifica ocurrencias atascadas por umbral.
- [ ] Existe escalamiento para fallos cercanos a horario de publicación.

### Verificación obligatoria

- [ ] Inyectar cada categoría de alerta.
- [ ] Confirmar deduplicación, resolución y reapertura.
- [ ] Ejecutar reconciliación sobre órdenes ambiguas.

### Fuera de alcance

- Elegir proveedor definitivo de mensajería si aún no fue aprobado.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P6-T08 — Resolver zonas horarias, feriados y excepciones

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P6-T04`, `P6-T06`
- Riesgo: Alto

### Objetivo

Evitar mensajes y horarios incorrectos en cambios de calendario, cierres
excepcionales y reglas que cruzan medianoche.

### Entregables

- Calendario de excepciones por ubicación.
- Política de timezone y tolerancia.
- UI para cierres y horarios especiales.

### Criterios de aceptación

- [ ] Se usa zona IANA, nunca solo offset fijo.
- [ ] Excepciones tienen prioridad explícita sobre horario semanal.
- [ ] Cambios invalidan ocurrencias futuras afectadas.
- [ ] Reglas al borde de medianoche usan la fecha local correcta.
- [ ] Un dato faltante bloquea historias sensibles a horario.
- [ ] El usuario ve el impacto antes de guardar.

### Verificación obligatoria

- [ ] Casos de medianoche, fin de mes/año y DST en una zona que lo use.
- [ ] Feriado completo, horario reducido y cierre inesperado.
- [ ] Comprobar invalidación y re-aprobación.

### Fuera de alcance

- Obtener feriados de una fuente externa no aprobada.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P6-T09 — Validar programación de punta a punta

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P6-T07`, `P6-T08`
- Riesgo: Alto

### Objetivo

Demostrar publicaciones únicas y recurrentes en tiempo real, incluyendo reinicios
y condiciones de carrera, antes de considerar el sistema automatizado.

### Entregables

- Escenarios E2E temporales.
- Informe de precisión, duplicados y recuperación.
- Evidencia remota de staging.

### Criterios de aceptación

- [ ] Una publicación única sale dentro de la tolerancia acordada.
- [ ] Una historia recurrente materializa contenido correcto.
- [ ] Reiniciar dispatcher/worker/Redis no pierde ni duplica.
- [ ] Un cambio material previo bloquea la salida.
- [ ] Estado local y remoto se reconcilian.
- [ ] Las alertas permiten actuar antes o después del fallo.

### Verificación obligatoria

- [ ] Ejecutar escenario normal, reinicio, fallo externo y doble worker.
- [ ] Verificar timestamp e IDs remotos.
- [ ] Conservar logs correlacionados y reporte.

### Fuera de alcance

- Automatización desde compras del sistema comercial.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## Criterios de salida de Fase 6

- [ ] `P6-T01` a `P6-T09` están completas.
- [ ] Programaciones sobreviven reinicios sin pérdidas ni duplicados.
- [ ] Historias recurrentes respetan horario, ubicación y excepciones.
- [ ] Validación previa bloquea contenido inválido o vencido.
- [ ] Operación cuenta con calendario, alertas y reconciliación.
