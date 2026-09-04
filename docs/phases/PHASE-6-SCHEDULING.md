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

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Se guarda instante UTC y zona IANA original.
- [x] Una programación referencia snapshot aprobado y destinos.
- [x] Una regla recurrente tiene vigencia, frecuencia y política de excepción.
- [x] Cada ocurrencia tiene identidad estable e idempotente.
- [x] Editar una regla no reescribe ocurrencias ya publicadas.
- [x] Cancelación y expiración conservan historial.

### Verificación obligatoria

- [x] Tests de cambio de día, mes, año y zona horaria.
- [x] Casos de regla editada, pausada, cancelada y expirada.
- [x] Migración y restricciones de unicidad.

### Fuera de alcance

- Despachar trabajos.

### Notas de progreso

- Fecha: 2026-09-01.
- Estado real: el modelo, la migración y el cálculo de próxima ocurrencia están
  implementados y verificados. La tarea cierra. Nada despacha todavía: eso es
  `P6-T02` y sigue fuera de alcance.
- Archivos: `packages/domain/src/publication-schedule.ts` y su prueba;
  export en `index.ts`; dos modelos y siete enums en `schema.prisma`; migración
  `20260901120000_publication_schedules` con su `down.sql`; seis pruebas de
  integración en `repositories.integration.test.ts`;
  [`ADR-023`](../architecture/decisions/ADR-023-OCCURRENCE-CIVIL-IDENTITY.md).
- **La identidad de una ocurrencia es su hora civil local, no su instante.** El
  instante se mueve cuando cambia tzdata o cuando se corrige la zona de una
  programación, que es justo cuando no debe moverse. Con la clave civil,
  volver a materializar encuentra la fila existente y el índice único impide el
  duplicado. Está en `ADR-023` con sus alternativas descartadas.
- **La vigencia se evalúa en fechas civiles y no en instantes.** Se descubrió
  al probar una programación única: `effective_from` a medianoche UTC pertenece
  al día local anterior en Córdoba, así que la ocurrencia de las nueve caía
  antes del inicio de vigencia y desaparecía. Comparar por fecha local es lo que
  el negocio quiere decir con «del 15 al 30», y además elimina toda esa clase de
  error. Quedó además `singleOccurrenceRule`, que arma la regla desde la fecha
  local elegida para que nadie tenga que calcular qué instante cae dentro del
  día correcto.
- **Las dos anomalías de zona son estados legítimos, no errores.** Una hora que
  no existe se saltea o se corre según `gap_policy` y se marca `shifted`; una
  que ocurre dos veces toma la primera y se marca `ambiguous`. La resolución se
  guarda porque después no se puede recalcular: la tzdata de mañana puede ser
  otra.
- **Detectar la ambigüedad obligó a cambiar el algoritmo.** La técnica habitual
  —suponer el instante y refinarlo con el desfasaje que devuelve— converge
  siempre al mismo lado del salto, así que la hora repetida parecía única. Los
  candidatos salen ahora de los desfasajes de un día antes y un día después, y
  la prueba de la vuelta de reloj de Madrid es la que lo demuestra.
- **Dos CHECK estaban mal escritos y las pruebas lo mostraron.** `array_length`
  devuelve NULL sobre un arreglo vacío, y un CHECK que evalúa NULL **no** se
  viola: la restricción de «al menos un destino» y la de «al menos un día de la
  semana» dejaban pasar exactamente el caso que existían para impedir. Se
  reescribieron con `cardinality`, que devuelve 0. Es la misma trampa ternaria
  que `P5-T06` ya había encontrado en un `NOT` de Prisma.
- **El estado de publicación no se copia a la ocurrencia.** La ocurrencia sólo
  dice si espera, si alguien la sacó del calendario o si ya produjo una orden;
  el desenlace remoto lo sabe la orden. La base exige que `dispatched` tenga
  orden y que ninguna orden pertenezca a dos ocurrencias.
- Verificaciones ejecutadas: 28 pruebas nuevas de dominio —221 en el paquete—,
  seis de integración contra PostgreSQL real, y `pnpm verify` completo en verde.
  La migración se aplicó desde base vacía, se revirtió con su `down.sql` y se
  reaplicó dentro de `pnpm db:test`.
- Desviación registrada: el PostgreSQL efímero disponible localmente fue **14.19**
  y no el 17.9 de los entornos. Todo lo que usa la migración —enums, arreglos,
  `cardinality`, CHECK e índices únicos parciales— existe desde 9.4, así que el
  riesgo es bajo, pero la comprobación en 17 queda pendiente de la próxima
  corrida con Docker disponible.
- Próximo paso exacto: `P6-T02`, el dispatcher persistente, que consume
  `planOccurrences` y `diffOccurrences` sin volver a resolver zonas.

### Evidencia de cierre

- Commit: rama `codex/p6-t01-schedule-model`.
- Comandos y resultados: `pnpm verify` completo en verde —stack, plan, formato,
  build, lint, typecheck, 221 pruebas de dominio, línea base y smokes de API,
  web y worker—; `pnpm db:test` completo, con migración desde base vacía,
  reversión con `down.sql` y reaplicación; 52 pruebas de integración en verde,
  seis de ellas nuevas.
- Evidencia visual o remota: no aplica. La tarea no tiene superficie visible ni
  toca proveedores externos.
- Desviaciones aprobadas: verificación de la migración sobre PostgreSQL 14.19
  local en lugar de 17.9, por no haber Docker disponible en la sesión.

## P6-T02 — Implementar dispatcher persistente

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Un reinicio no pierde ocurrencias.
- [x] Dos dispatchers no reclaman la misma ocurrencia simultáneamente.
- [x] Solo estados habilitados y dentro de ventana se encolan.
- [x] La marca de despacho y evento outbox son atómicos.
- [x] Backlog y atraso quedan observables.
- [x] Redis vacío puede reconstruirse desde la base.

### Verificación obligatoria

- [x] Ejecutar dos instancias concurrentes.
- [x] Vaciar Redis de prueba y recuperar trabajos pendientes.
- [x] Simular caída entre selección, commit y enqueue.

### Fuera de alcance

- Llamar a Meta directamente.

### Notas de progreso

- Fecha: 2026-09-04.
- Estado real: el worker reclama ocurrencias vencidas con
  `FOR UPDATE SKIP LOCKED`, aplica la política de atraso y escribe la marca de
  solicitud junto con un evento outbox en una sola transacción. El transporte
  BullMQ usa el UUID de la ocurrencia como `jobId`; todavía no consume ni crea
  una orden, que sigue siendo alcance de `P6-T03`.
- PostgreSQL conserva dos marcas distintas del desenlace final:
  `dispatch_requested_at` prueba que el dispatcher produjo una intención
  durable; `dispatched_at` continúa reservado para cuando `P6-T03` cree o
  reutilice la orden. La ocurrencia sigue `planned` entre ambos pasos, porque
  copiar en ella el estado de Redis crearía una segunda fuente de verdad.
- El barrido periódico selecciona sólo ocurrencias `planned` de reglas `active`.
  `skip` vence ante cualquier atraso; `run_late` usa la tolerancia guardada. Una
  ocurrencia fuera de ventana pasa a `skipped` con `missed-window` y nunca llega
  a Redis.
- El enqueue normal ocurre después del commit y el mismo evento pasa por el
  outbox general. Cada 30 segundos, y también al arrancar, el worker pagina las
  ocurrencias marcadas que siguen `planned` y vuelve a asegurar sus jobs. Por
  eso perder Redis, caer antes del enqueue o perder una entrega outbox no pierde
  el calendario.
- La migración hace backfill desde eventos outbox existentes cuando se reaplica
  después de un rollback. Sin eso, quitar y volver a agregar las columnas de
  marca olvidaría qué ocurrencias ya tenían evento y fabricaría una segunda
  intención.
- Backlog, pendientes sin reclamar, pendientes ya encoladas y atraso máximo en
  milisegundos salen en el log estructurado `scheduling.dispatch`.
- BullMQ queda fijado en `6.2.2` y usa el adaptador oficial de `redis@6.1.0`.
  El shutdown destruye el cliente poseído sin esperar un handshake imposible;
  el smoke confirmó que Redis caído ya no bloquea `SIGTERM`.
- Archivos principales: contrato en
  `packages/domain/src/publication-schedule.ts`; repositorio Prisma en
  `infrastructure/database/src/publication-schedule-dispatch-repository.ts`;
  migración `20260904220000_schedule_dispatch_outbox`; módulo
  `apps/worker/src/scheduling/`; ruta nueva en el outbox y verificación de base.
- Verificaciones ejecutadas: unitarias del worker, `pnpm db:test` contra
  PostgreSQL 17.9 y Redis 8.2.7, build, lint, typecheck y smoke. `pnpm verify`
  completo queda registrado en la evidencia de cierre.
- Próximo paso exacto: `P6-T03`, consumir el job, crear o reutilizar la orden en
  una transacción y adquirir el lock con heartbeat antes de cualquier llamada a
  Meta.

### Evidencia de cierre

- Commit: rama `codex/p6-t02-persistent-dispatcher`.
- Comandos y resultados: `pnpm db:test` aplicó desde cero, ejecutó 54 pruebas
  de integración, vació/reconstruyó la cola real, revirtió la última migración,
  la reaplicó y repitió la integración; `pnpm verify` completo en verde.
- Evidencia de concurrencia y recuperación: una sola marca/outbox para dos
  repositorios concurrentes; Redis borrado y job restaurado con el mismo
  `jobId`; fallos simulados antes del commit y después del commit.
- Evidencia visual o remota: no aplica. No se contactó Meta ni otro proveedor
  externo.
- Desviaciones aprobadas: ninguna.

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
