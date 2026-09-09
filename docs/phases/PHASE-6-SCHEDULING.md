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

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Solo un worker posee una ocurrencia a la vez.
- [x] Un lock abandonado puede recuperarse sin duplicar publicación.
- [x] Reentrega del job devuelve la orden existente.
- [x] El estado final deriva de intentos reales por destino.
- [x] Un proceso terminado durante Meta se reconcilia antes de reintentar.
- [x] La ocurrencia registra timestamps planificado, iniciado y finalizado.

### Verificación obligatoria

- [x] Workers concurrentes sobre la misma ocurrencia.
- [x] Terminación forzada en cada punto crítico.
- [x] Reentrega masiva y confirmación de ausencia de duplicados.

### Fuera de alcance

- Generar automáticamente contenido recurrente.

### Notas de progreso

- Fecha: 2026-09-08.
- Estado real: el consumidor BullMQ valida el payload mínimo y disputa una
  lease durable en PostgreSQL. La tarea cierra sin llamadas reales a Meta.
- Responsabilidades: BullMQ transporta y retrasa; el servicio ejecutor mantiene
  heartbeat; el repositorio Prisma decide ownership y materializa la orden en
  una transacción. Esta separación sigue el módulo Nest existente y evita que
  Redis se convierta en fuente de verdad.
- La lease persiste propietario, token UUID, vencimiento y último heartbeat.
  `FOR UPDATE` serializa la adquisición; sólo el token vigente puede completar.
  El primer `execution_started_at` no se pierde al recuperar una lease vencida.
- Orden, destinos, transición de publicación, auditoría, evento outbox y enlace
  con la ocurrencia se crean atómicamente. El UUID de la orden es el UUID de la
  ocurrencia, por lo que `orden:destino` funciona como clave estable
  ocurrencia/destino. Está documentado en
  [`ADR-024`](../architecture/decisions/ADR-024-SCHEDULED-EXECUTION-LEASE.md).
- Una lease ocupada mueve el mismo job a `delayed` hasta su vencimiento sin
  consumir intentos. Una entrega posterior al commit devuelve la orden ya
  enlazada y no crea otro outbox ni otros destinos.
- `execution_completed_at` significa «orden materializada». El desenlace de
  Meta continúa exclusivamente en los intentos por destino de P5: éxito,
  fallo, parcial o ambigüedad. Un resultado ambiguo queda sin trabajo pendiente
  y aparece en reconciliación antes de admitir cualquier reintento.
- Terminaciones cubiertas: antes del commit queda trabajo reconstruible; con
  lease adquirida, su vencimiento habilita otro propietario; después del commit,
  la reentrega recupera la orden; durante Meta, el diario conserva el desenlace
  `unknown` y obliga a reconciliar. Cincuenta reentregas concurrentes conservaron
  una orden y un destino.
- Archivos principales: contratos en
  `packages/domain/src/publication-schedule.ts`; migración
  `20260907120000_scheduled_publication_execution`; repositorio
  `publication-occurrence-execution-repository.ts`; servicio y consumidor en
  `apps/worker/src/scheduling/`; pruebas unitarias, de PostgreSQL y de Redis.
- Próximo paso exacto: `P6-T04`, materializar historias recurrentes como
  borradores concretos, sin confundir esa aprobación con el despacho técnico.

### Evidencia de cierre

- Commit: rama `codex/p6-t03-scheduled-publication-execution`.
- Comandos y resultados: `pnpm db:test` aplicó la migración desde cero sobre
  PostgreSQL 17.9, ejecutó 57 pruebas de repositorios más las integraciones de
  render y BullMQ, revirtió la última migración y la reaplicó; `pnpm verify`
  pasó stack, plan, formato, build, lint, typecheck, tests, baseline y smoke.
  El worker cerró 318 pruebas activas en verde y una omitida preexistente.
- Evidencia de concurrencia y recuperación: carrera real entre dos repositorios,
  renovación y vencimiento de lease, rechazo del propietario anterior,
  consumidor Redis real con espera hasta `retryAt`, reentrega después del
  commit y lote de 50 reentregas sin duplicados.
- Evidencia de interrupción remota: un intento programado marcado `unknown`
  mantiene la orden en `publishing`, no vuelve a `pending` y aparece en la cola
  de reconciliación de P5.
- Evidencia visual o remota: no aplica. No se contactó Meta ni otro proveedor
  externo.
- Desviaciones aprobadas: ninguna.

## P6-T04 — Materializar historias recurrentes

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Cada ocurrencia genera un borrador versionado, no una publicación invisible.
- [x] Horario y ubicación se consultan al materializar y se citan.
- [x] Excepciones de feriado impiden mensajes incorrectos.
- [x] Cambios posteriores de horario invalidan borradores aún no publicados.
- [x] La política define si requiere aprobación humana en cada ciclo.
- [x] El preview respeta formato story y safe zones.

### Verificación obligatoria

- [x] Casos normal, feriado, horario especial, ubicación cerrada y dato faltante.
- [x] Cambiar horario luego de materializar y comprobar invalidación.
- [x] E2E regla–borrador–aprobación–ocurrencia.

### Fuera de alcance

- Disparadores por compras o stock real.

### Notas de progreso

- Fecha: 2026-09-07.
- Estado real: la cadena completa funciona de punta a punta y no contacta
  ningún proveedor externo. Decisiones en
  [`ADR-025`](../architecture/decisions/ADR-025-RECURRING-STORY-MATERIALIZATION.md).
- **Una ocurrencia produce un borrador real, no una publicación invisible.** La
  materialización crea `Publication` y `PublicationRevision` versionadas y las
  identifica por `organización + regla + clave de ocurrencia`, con la misma
  clave civil de `ADR-023`. Volver a materializar encuentra la fila y el índice
  único impide el duplicado.
- **La fuente se consulta al materializar y se cita.** El snapshot guarda
  dirección, horario, nombre y versión de sucursal, el instante de captura y si
  el dato salió de la configuración vigente o de una excepción del día. El copy
  se compone con ese dato, no con una frase guardada.
- **Un bloqueo es un hecho registrado.** Sucursal inactiva, día cerrado y
  horario faltante crean una materialización sin publicación y con su código de
  causa. Queda auditable y no se reintenta sobre la misma ocurrencia.
- **Una excepción vuelve siempre a revisión humana**, aunque la regla sea
  automática: una rutina tiene autoridad sobre la rutina, no sobre el día raro.
- **La política automática aprueba al terminar el render, no al materializar**,
  porque antes no hay pieza que aprobar. En ese momento se vuelve a comprobar
  que quien creó la regla siga activo y conserve `admin` y `approver`; si los
  perdió, el borrador pasa a exigir revisión humana. La automatización puede
  reducirse sola y nunca ampliarse.
- **Aprobar programa.** La aprobación —humana o automática— crea una
  programación `once` con destino `instagram_story` y una única ocurrencia. Por
  eso `PublicationApprovalResponse.status` pasa a ser `approved | scheduled`.
  La orden de publicación sigue naciendo en `P6-T03`.
- **Cambiar la sucursal invalida lo que todavía no salió.** Editar dirección,
  ciudad, provincia, nombre, horario, zona o actividad cancela la programación y
  sus ocurrencias planificadas, lleva la publicación a `validation_failed` con
  `factual-source-changed` y marca la materialización `invalidated`. No se borra
  nada. Eso agregó transiciones hacia `validation_failed` desde `draft`,
  `generating_assets`, `approved` y `scheduled`.
- **La vista previa no redeclara medidas.** La relación de aspecto y las cuatro
  zonas seguras salen de `FORMATS.historia`, que es su única definición, y el
  E2E las mide en el navegador contra esos números.
- **El lote acota trabajo nuevo, no relecturas.** Contar contra el límite las
  ocurrencias ya materializadas dejaba sin turno a las reglas más recientes,
  porque el barrido siempre empieza por las más antiguas. Ahora el presupuesto
  y la ventana de lectura son cosas distintas: el límite cuenta creaciones y
  bloqueos, una sola consulta por regla descarta lo ya resuelto sin abrir
  transacción, y la lectura tiene su propio techo.
- **Límite conocido, entregado a `P6-T08`**: `location_day_overrides` existe y
  se consulta, pero todavía no tiene pantalla de gestión, así que hoy sólo se
  cargan por base. Cambiar una excepción tampoco invalida borradores ya
  materializados; sí lo hace cambiar la configuración de la sucursal. La UI de
  cierres y horarios especiales es entregable de `P6-T08`.
- Archivos principales: dominio en `packages/domain/src/recurring-story.ts`;
  contratos en `packages/contracts/src/recurring-story.ts`; migración
  `20260907190000_recurring_story_materialization`; repositorio
  `infrastructure/database/src/recurring-story-repository.ts`; invalidación en
  `organization-configuration-repository.ts`; aprobación y programación en
  `publication-production-repository.ts`; módulo API en
  `apps/api/src/scheduling/`; servicio y bucle en `apps/worker/src/scheduling/`;
  compositor en `apps/web/app/publicaciones/recurring-story-composer.tsx`; E2E en
  `tools/e2e-recurring-story/`.
- Próximo paso exacto: `P6-T05`, revalidar justo antes del envío externo.

### Evidencia de cierre

- Commit: rama `codex/p6-t04-recurring-stories`.
- Comandos y resultados: `pnpm verify` completo en verde —stack, plan, formato,
  build, lint, typecheck, tests, baseline y smoke—. `pnpm db:test` aplicó la
  migración desde una base vacía, ejecutó 61 pruebas de repositorios más las
  integraciones de render y BullMQ, revirtió `down.sql` comprobando que
  desaparecen reglas, excepciones, materializaciones y su tipo enumerado sin
  tocar lo de `P6-T01` a `P6-T03`, y la reaplicó.
- Evidencia de casos: pruebas de dominio y de PostgreSQL sobre normal, feriado
  cerrado, horario especial, sucursal inactiva y horario faltante —`blocked: 3,
  created: 1, reviewed: 4` en un lote de cuatro reglas—, y una prueba dedicada a
  la rutina automática que aprueba al terminar el render mientras la misma
  corrida deja en `draft_created` la regla cuyo autor perdió el rol.
- Evidencia de invalidación: cambiar dirección y horario después de materializar
  dejó la materialización `invalidated`, la publicación en `validation_failed` y
  la ocurrencia `cancelled`.
- Evidencia E2E: `pnpm e2e:recurring-story` en verde, con seis comprobaciones
  sobre la vertical real —panel, API, worker, PostgreSQL y Chromium—: vista
  previa medida contra `FORMATS.historia` (relación 0,5625; zona superior
  0,1302; zona inferior 0,1562), activación de la regla sin crear pieza,
  materialización que cita la fuente, aprobación por HTTP que responde
  `scheduled` y ocurrencia planificada sin orden de publicación.
- Evidencia visual o remota: no aplica. No se contactó Meta, Cloudinary ni
  OpenAI; el almacenamiento de medios del E2E es un doble local.
- Desviaciones aprobadas: ninguna.

## P6-T05 — Validar nuevamente antes de publicar

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Confirma snapshot aprobado y no invalidado.
- [x] Confirma conexión, permiso y destino saludables.
- [x] Confirma acceso y formato del medio.
- [x] Revalida precio, stock, promoción y horario cuando corresponda.
- [x] Un cambio material bloquea y solicita nueva revisión.
- [x] Una falla de validación no consume intento remoto.

### Verificación obligatoria

- [x] Casos de token revocado, medio ausente y evidencia vencida.
- [x] Cambiar precio/stock después de aprobar.
- [x] Confirmar código, alerta y estado correctos.

### Fuera de alcance

- Corregir automáticamente datos materiales.

### Notas de progreso

- Fecha: 2026-09-07.
- La aprobación persiste un perfil mínimo de prepublicación con los hechos
  dinámicos requeridos, su evidencia y —para historias recurrentes— la fuente
  de horario y sucursal. Los snapshots históricos sin perfil bloquean por
  precaución; el contenido manual que menciona precio, stock, promoción u
  horario también exige evidencia.
- `PrePublishValidator` verifica estado/snapshot, evidencia y fuente recurrente,
  activo y entrega pública, formato por destino, conexión, permisos, activos y
  credencial de Meta. Precio y stock se reconsultan mediante el puerto comercial
  existente, con ámbito de organización, sucursal y solicitante; una promoción
  sin fuente aprobada bloquea, nunca se corrige sola.
- Un bloqueo cancela la orden, registra el código accionable y auditoría en la
  misma transacción y retorna antes del publicador. Si otro destino ya salió o
  quedó con desenlace incierto, conserva ese hecho y cancela sólo los restantes.
- Archivos principales: `packages/domain/src/pre-publish-validation.ts`,
  `apps/worker/src/publishing/pre-publish.validator.ts`,
  `apps/worker/src/publishing/pre-publish-commercial.adapter.ts`,
  `infrastructure/database/src/publication-order-repository.ts` y sus pruebas.

### Evidencia de cierre

- Commit: `01a5e78` (`feat(scheduling): validate before external publication`).
- `pnpm db:test` — base efímera, migración, aislamiento y reversión verificados.
- `pnpm e2e:publishing` — flujo de publicación completo.
- `pnpm e2e:recurring-story` — historia recurrente completa.
- `pnpm verify` — stack, plan, formato, build, lint, typecheck, pruebas,
  baseline y smoke completos.

## P6-T06 — Construir calendario y gestión de programación

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] El usuario siempre ve fecha, hora y zona.
- [x] Cambiar una regla explica qué ocurrencias se modificarán.
- [x] No se programa una pieza no aprobada o en el pasado fuera de tolerancia.
- [x] Conflictos de versión no sobrescriben cambios ajenos.
- [x] Estados vacío, cargando, error, bloqueado y parcial son explícitos.
- [x] La UI es operable por teclado y usable en móvil.

### Verificación obligatoria

- [x] E2E crear–mover–pausar–reanudar–cancelar.
- [x] Prueba en dos zonas horarias del navegador.
- [x] Auditoría de accesibilidad.

### Fuera de alcance

- Analítica de mejores horarios.

### Notas de progreso

- Fecha: 2026-09-08.
- Estado real: iniciada la revisión de arquitectura. Las dependencias
  `P6-T01` y `P6-T05` están completas, pero la aplicación sólo expone la
  creación de historias recurrentes; no existe aún un puerto/repositorio/API
  para crear, mover, pausar, reanudar o cancelar programaciones generales.
- Restricciones confirmadas: sólo snapshots aprobados; fecha civil, instante UTC
  y zona IANA deben aparecer juntos; editar nunca reescribe ocurrencias
  `dispatched`; cada mutación necesita compare-and-swap, idempotencia, auditoría
  y una representación explícita de conflicto o resultado parcial.
- Diseño de responsabilidades: `packages/domain` definirá el contrato de
  gestión y sus diffs de ocurrencias; un repositorio Prisma hará la mutación de
  programación, sus ocurrencias futuras y transición/auditoría en una única
  transacción; `apps/api/scheduling` expondrá DTOs y mapeo de errores; el panel
  consumirá contratos públicos en una vista calendario/lista separada de los
  compositores de contenido.
- Archivos previstos: contrato y pruebas de programación en dominio,
  `infrastructure/database` (incluida versión CAS de `PublicationSchedule`),
  módulo API de scheduling, contratos públicos, `apps/web/app/programacion/` y
  un E2E de crear–mover–pausar–reanudar–cancelar.
- Verificación prevista: pruebas unitarias de reglas y conflictos, integración
  de PostgreSQL para transacción/ownership, E2E en Córdoba y Madrid, auditoría
  de teclado/lectores y `pnpm verify`.
- Próximo paso exacto: implementar el puerto de gestión y la migración de
  versión de programación antes de crear la superficie HTTP o visual.
- Avance 2026-09-08: `PublicationSchedule` ya tiene `version` persistida con
  default `1`, migración reversible y contrato de dominio. La base efímera
  verificó aplicar, revertir y reaplicar la migración; el siguiente cambio usa
  esa versión como `expectedVersion` para los comandos de gestión.
- Decisión registrada: [`ADR-026`](../architecture/decisions/ADR-026-SCHEDULE-CANCELLATION-SEMANTICS.md)
  separa cancelar una programación de cancelar una pieza; sólo las ocurrencias
  planificadas pueden cambiar y la última programación cancelada devuelve la
  pieza aprobada a `approved`.
- Avance 2026-09-08: el dominio ahora calcula `pause`, `resume` y `cancel`
  con compare-and-swap de versión y sin alterar el snapshot; 230 pruebas
  unitarias cubren esa matriz de transiciones.
- Avance 2026-09-08: `PrismaPublicationScheduleManagementRepository` aplica
  esas transiciones con idempotencia y auditoría en una única transacción.
  `cancel` retira sólo ocurrencias `planned`, informa las `dispatched` que se
  conservan y, si ya no queda otra programación activa o pausada, devuelve la
  publicación de `scheduled` a `approved` con transición inmutable
  `unschedule`. La migración del nuevo comando se aplica, revierte y reaplica
  sobre datos de prueba sin dejar el trigger de historial desactivado.
- Avance 2026-09-08: `POST /schedules/:scheduleId/transitions` requiere
  `content:schedule`, versión esperada e `Idempotency-Key`; valida que el
  motivo exista sólo al cancelar y expone recuentos de ocurrencias canceladas y
  despachadas para que la interfaz represente el resultado parcial.
- Avance 2026-09-08: el mismo puerto transaccional crea programaciones sólo
  desde una publicación `approved` o `scheduled` que conserva snapshot. Valida
  la política de destinos, la regla y la tolerancia antes de escribir; crea la
  regla y sus primeras ocurrencias, deja la auditoría/idempotencia y mueve la
  publicación de `approved` a `scheduled` en una única transacción. Una regla
  única vencida no deja fila; una recurrencia recibe una ventana inicial de 90
  días —o su próxima ocurrencia válida si cae más lejos— que el materializador
  futuro deberá reponer antes de agotarse. La integración comprueba snapshot,
  cambio de estado, ocurrencias, repetición idempotente y bloqueos por estado o
  fecha pasada.
- Avance 2026-09-08: `POST /publications/:publicationId/schedules` traduce el
  formulario civil a una regla con instante UTC y zona IANA; admite una vez,
  diaria, semanal y mensual con sus campos mutuamente excluyentes. Requiere
  `content:schedule`, `expectedPublicationVersion` e `Idempotency-Key` y
  devuelve el número de ocurrencias materializadas junto con la versión nueva
  de la pieza. La API rechaza horas inexistentes, zonas inválidas, políticas de
  recurrencia mezcladas y destinos que no fueron aprobados antes de llegar a
  persistencia.
- Avance 2026-09-08: mover una regla ya usa su versión propia como CAS y
  calcula un diff contra las ocurrencias persistidas dentro de la misma
  transacción. Crea, reprograma o cancela sólo las filas `planned`; conserva
  como congeladas tanto las `dispatched` como las que ya tienen job solicitado
  en el outbox, porque modificar una de esas filas podría ejecutar una fecha
  diferente a la aprobada. El resultado idempotente informa los cuatro conteos
  para que el formulario explique el efecto real y no presente una edición
  parcial como éxito plano.
- Avance 2026-09-08: `PATCH /schedules/:scheduleId` recibe el mismo contrato
  civil de la creación, pero compara `expectedVersion` de la regla. Devuelve
  filas creadas, reprogramadas, retiradas y congeladas por separado. Los DTOs
  comparten la validación de regla —sin permitir campos semanales o mensuales
  que la frecuencia elegida no usa— y la prueba del servicio verifica que esos
  conteos e idempotencia lleguen sin perderse al contrato público.
- Avance 2026-09-08: `GET /schedules?from&to` y
  `GET /schedules/:scheduleId?from&to` exponen calendario y detalle bajo
  `content:read`. La ventana UTC se normaliza y limita a 93 días, mientras la
  respuesta conserva por ocurrencia el instante, clave civil, resolución y
  estado, y por regla la fecha local, zona IANA, recurrencia, destinos, snapshot
  y versión. La integración cubre listado, detalle y rechazo de una ventana
  fuera del límite.
- Avance 2026-09-08: `POST /schedules/:scheduleId/preview` calcula el mismo
  diff de una edición sin crear operación idempotente ni escribir filas. Exige
  versión de regla y permiso `content:schedule`, por lo que muestra altas,
  bajas, reprogramaciones y ocurrencias congeladas antes de confirmar; el
  `PATCH` posterior conserva CAS e idempotencia propios.
- Avance 2026-09-08: el worker repone en PostgreSQL el horizonte de 90 días de
  reglas activas con un puerto separado del dispatcher y `FOR UPDATE SKIP
  LOCKED`. La reposición no toca Redis ni crea órdenes; sólo inserta claves
  civiles ausentes, omite duplicados por índice único y mantiene el horizonte.
  Una única ya resuelta pasa a `completed`; una regla con vigencia terminada
  pasa a `expired` sólo cuando no conserva ocurrencias planificadas, para que
  el dispatcher alcance a aplicar la política de atraso. Ambos cambios avanzan
  versión para invalidar una edición concurrente.
- Estado final 2026-09-08: el panel `/programacion` reúne el calendario y la
  línea de tiempo móvil con el detalle de snapshot, destinos, ocurrencias y
  estado. El cliente consume los contratos públicos con validación fail-closed;
  crear, mover, pausar, reanudar y cancelar adquieren CSRF, versión e
  idempotencia según corresponda. Mover exige `preview` de la misma versión
  antes de habilitar su confirmación y muestra altas, bajas, reprogramaciones y
  filas congeladas por job u orden ya solicitados.
- La fecha local, hora y zona IANA viajan juntas en cada turno. El formulario
  omite `effectiveUntil` para reglas únicas —aunque esa cota exista internamente
  para materializarlas— y el detalle usa opciones compatibles de `Intl` para
  no caerse al seleccionar una ocurrencia. Cada riel escribe `Planificada`,
  `Cancelada`, `Despachada` o `Salteada`: el estado no queda implícito sólo en
  color.
- El E2E nuevo prepara una organización efímera y una sesión real con
  `content:schedule`; usa teclado para crear, prueba el ciclo completo de
  transiciones y confirma en PostgreSQL que nunca nace una orden ni se pierde el
  snapshot. Repite la lectura desde un navegador en `America/New_York` y móvil:
  la regla conserva `America/Argentina/Cordoba` y su hora local. La captura
  generada, ignorada por Git, queda en
  `output/playwright/p6-t06-calendar-mobile.png`.
- Verificaciones ejecutadas: 77 pruebas del cliente web, lint, typecheck de
  los tres E2E, build del panel, `pnpm e2e:scheduling` y formato. La auditoría
  de accesibilidad comprobó foco y activación por teclado del alta, controles
  con roles/etiquetas, feedback `aria-live`, estados textuales y la línea de
  tiempo de 390 px. `pnpm verify` completo —incluidos `verify:plan`, build,
  lint, typecheck, tests, baseline y smoke— terminó en verde.
- Próximo paso exacto: `P6-T08`, excepciones y horarios especiales.

### Contrato de diseño — Calendario de programación

- **Sujeto y trabajo primario:** una persona operadora de Ferretería y
  Lubricentro Aramayo decide cuándo saldrá una pieza ya aprobada y debe poder
  detectar de inmediato si una ocurrencia ya quedó comprometida. La acción
  primaria es calcular el impacto y confirmar una programación deliberada; no
  es «rellenar eventos» ni publicar.
- **Jerarquía y firma visual:** la pantalla reutiliza la `Mesa de contenido`:
  papel cálido, tipografía condensada, tinta oscura y rieles de estado. El
  calendario es una planilla de despacho: cada ocurrencia lleva una franja de
  turno que muestra fecha civil, hora y zona IANA juntas. El detalle lateral
  muestra snapshot, destinos y estado de las ocurrencias; nunca oculta un job
  ya solicitado detrás de un evento movible.
- **Acciones y estados:** el panel separa cargar, vacío, bloqueado, error,
  listo y resultado parcial. Crear y mover poseen formularios distintos; mover
  requiere calcular impacto antes de habilitar la confirmación. Pausar,
  reanudar y cancelar son acciones explícitas con versión e idempotencia; la
  cancelación expone qué quedó despachado.
- **Responsive y accesibilidad:** en escritorio se ve mes/lista y detalle;
  en móvil el listado cronológico sustituye la grilla comprimida. Todos los
  eventos y acciones son botones etiquetados, el foco es visible y los estados
  no dependen sólo de color.
- **Referencia de investigación (2026-09-08):** se tomaron de
  [Date of Birth / Revolut Business](https://uizze.com/screens/699b3f0200202d0554d0)
  la grilla de días clara y navegable por teclado; de
  [Spending period / Revolut Business](https://uizze.com/screens/699b41ce002688d29f0e)
  la explicitud de un rango antes de aplicarlo; y de
  [Bill Review / Revolut Business](https://uizze.com/screens/699b42df0006e5446371)
  el vínculo entre un turno y la información para revisarlo. Se transfiere esa
  claridad funcional, no su estética financiera oscura, sus métricas ni sus
  tarjetas genéricas.
- **Antipatrones prohibidos:** calendario de plantilla sin zona horaria,
  tarjetas KPI que no ayudan a decidir, chips de color sin texto de estado,
  fecha UTC sola, edición que parezca mover ocurrencias ya encoladas y mes
  reducido a celdas ilegibles en móvil.

### Evidencia de cierre

- Commit: `92ab19d` (`feat(web): manage publication schedules`).
- Comandos y resultados: `pnpm --filter @aramayo/web test` (77 pruebas),
  `pnpm lint`, `pnpm run e2e:typecheck`, `pnpm --filter @aramayo/web build`,
  `pnpm e2e:scheduling`, `pnpm format:check` y `pnpm verify`, todos en verde.
- Evidencia visual o remota: Chrome real sobre base/API/panel efímeros en
  Córdoba y Nueva York; captura móvil revisada en
  `output/playwright/p6-t06-calendar-mobile.png`. No se contactó Meta ni otro
  proveedor externo.
- Desviaciones aprobadas: ninguna.

## P6-T07 — Implementar alertas y reconciliación operativa

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Alertas incluyen publicación, destino, causa y acción segura.
- [x] No incluyen tokens ni payloads sensibles.
- [x] Se deduplican sin ocultar recurrencias reales.
- [x] La resolución queda auditada.
- [x] El sistema identifica ocurrencias atascadas por umbral.
- [x] Existe escalamiento para fallos cercanos a horario de publicación.

### Verificación obligatoria

- [x] Inyectar cada categoría de alerta.
- [x] Confirmar deduplicación, resolución y reapertura.
- [x] Ejecutar reconciliación sobre órdenes ambiguas.

### Fuera de alcance

- Elegir proveedor definitivo de mensajería si aún no fue aprobado.

### Notas de progreso

- Fecha: 2026-09-08.
- Estado real: la tarea cierra. El worker conserva los barridos temporales y de
  reconciliación existentes y agrega, aun sin Meta habilitada, un barrido
  durable de alertas. La bandeja `/operacion` permite a quien tiene
  `publishing:execute` revisar la señal y navegar al paso seguro; reconocerla
  no publica, reintenta ni modifica Meta.
- Archivos: contrato y política en
  `packages/domain/src/publication-operational-alert.ts`; migración
  `20260908140000_publication_operational_alerts`; repositorio Prisma y prueba
  de integración; servicio del worker y mantenimiento; endpoints y servicio
  Nest; contrato público, cliente fail-closed y panel web `/operacion`.
- Cada huella se compone por tenant y recurso concreto. Una ocurrencia usa su
  propia identidad más destino, por lo que dos recurrencias no se tapan; una
  observación repetida incrementa el contador sin duplicar la alerta. Una
  resolución humana queda en auditoría y la misma condición vuelve a abrir la
  alerta con otra auditoría. Un barrido limitado nunca cierra por ausencia una
  alerta que no alcanzó a observar.
- A los cinco minutos una ocurrencia vencida sin despacho o sin ejecución
  completada es urgente. Destinos con fallo permanente, presupuesto de intentos
  agotado o desenlace remoto ambiguo se derivan de la acción manual segura; los
  problemas a media hora del horario programado escalan a urgente. Una conexión
  Meta degradada queda en atención o urgente si afecta una ocurrencia cercana.
- La alerta sólo persiste IDs internos, códigos y acción segura. El repositorio,
  auditoría, API y panel no incluyen token, payload remoto, copy ni mensaje
  crudo del proveedor. Reconciliar continúa siendo obligatorio antes de
  reintentar un desenlace ambiguo.

### Evidencia de cierre

- Commit: `e6192ab` (`feat(scheduling): detect operational publication alerts`)
  y `a05dac3` (`feat(scheduling): expose operational alert inbox`).
- Comandos y resultados: `pnpm db:test` (migración desde vacío, integración,
  down/up y 71 pruebas); `pnpm --filter @aramayo/web test` (80 pruebas) y
  `build`; `pnpm --filter @aramayo/api test` (120 pruebas) y `build`;
  `pnpm --filter @aramayo/worker test` (328 aprobadas y una omitida existente);
  `pnpm format:check` y `pnpm verify`, en verde.
- Evidencia visual o remota: navegador local contra un doble efímero verificó
  escritorio y 390 px, la alerta urgente, su acción segura, el reconocimiento
  auditado representado y el estado vacío posterior. No se contactó Meta ni
  otro proveedor externo.
- Desviaciones aprobadas: ninguna.

## P6-T08 — Resolver zonas horarias, feriados y excepciones

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Se usa zona IANA, nunca solo offset fijo.
- [x] Excepciones tienen prioridad explícita sobre horario semanal.
- [x] Cambios invalidan ocurrencias futuras afectadas.
- [x] Reglas al borde de medianoche usan la fecha local correcta.
- [x] Un dato faltante bloquea historias sensibles a horario.
- [x] El usuario ve el impacto antes de guardar.

### Verificación obligatoria

- [x] Casos de medianoche, fin de mes/año y DST en una zona que lo use.
- [x] Feriado completo, horario reducido y cierre inesperado.
- [x] Comprobar invalidación y re-aprobación.

### Fuera de alcance

- Obtener feriados de una fuente externa no aprobada.

### Notas de progreso

- Fecha: 2026-09-09.
- Alcance real: dominio de excepciones por fecha civil con normalización y
  rango acotado; repositorio Prisma con previsualización, alta/edición, borrado
  e invalidación en lote; contrato público, servicio y endpoints Nest;
  cliente web fail-closed y pantalla de excepciones dentro de cada sucursal en
  `/configuracion`.
- La zona IANA la aporta siempre la sucursal. Una excepción se dirige por fecha
  civil `AAAA-MM-DD` y la solicitud no transporta zona; con offset fijo o UTC el
  borde de medianoche cierra el día equivocado, y en una zona con horario de
  verano el error cambia según el mes.
- Resolver una ocurrencia con la excepción de otro día civil pasó a ser un
  error declarado del dominio. Antes se hubiera aplicado en silencio y habría
  publicado el horario de otro día.
- Crear, cambiar o quitar una excepción cancela la programación y las
  ocurrencias planificadas de esa fecha, lleva la publicación a
  `validation_failed` y marca la materialización `invalidated`, con auditoría
  por historia. El barrido posterior la vuelve a mirar y no la repone: hace
  falta una revisión humana.
- El panel no habilita guardar hasta calcular el impacto sobre historias
  reales, y ese cálculo sólo vale para el borrador exacto con el que se hizo:
  cambiar cualquier campo lo invalida. Previsualizar no escribe.
- No se agregó ninguna tolerancia nueva: la única sigue siendo
  `lateToleranceMinutes` por programación. Un dato faltante bloquea; no se
  publica tarde para alcanzar una ventana.

### Evidencia de cierre

- Commit: `cf10172` (`feat(scheduling): manage location day exceptions`).
- Decisión: [`ADR-027`](../architecture/decisions/ADR-027-LOCATION-DAY-EXCEPTIONS.md).
- Comandos y resultados: `pnpm verify` en verde —incluye `verify:stack`,
  `verify:plan`, `format:check`, `build`, `lint`, `typecheck`, `test`
  (dominio 240, API 125, panel 86, worker 328 con una omitida existente),
  `baseline:verify` y `smoke`—; `pnpm db:test` con 72 pruebas de integración
  sobre base efímera migrada desde vacío, incluida la nueva de excepciones;
  `pnpm e2e:recurring-story` completo.
- Evidencia visual o remota: el E2E con Chrome real recorrió regla → borrador →
  aprobación → ocurrencia y después cargó el feriado desde `/configuracion`:
  guardar quedó bloqueado hasta ver el impacto, el impacto contó la historia
  programada real y guardarlo canceló la ocurrencia y devolvió la publicación a
  revisión. No se contactó Meta ni Cloudinary.
- Casos cubiertos: medianoche y fin de año con la fecha civil separada de la
  UTC en `America/New_York`; día de cambio de hora; fin de mes y cruce de año en
  la expansión de ocurrencias; feriado completo, horario reducido y cierre
  inesperado; versión vencida al crear, editar y borrar; sucursal de otra
  organización representada como inexistente.
- Desviaciones aprobadas: la alta y edición de una excepción usa `POST` en vez
  de `PUT` porque el panel sólo tiene habilitados `GET`, `POST`, `PATCH` y
  `DELETE` en CORS; la comparación de versión conserva la semántica de
  reemplazo.

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
