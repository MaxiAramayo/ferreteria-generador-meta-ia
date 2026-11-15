# Auditoría de producción: Aramayo y convivencia con Notitas

ID: `OPS-AUDIT-2026-11-15`. Corte: 15/11/2026, aproximadamente 10:59–11:15
de Argentina (UTC−3). Solicitada explícitamente por el usuario.

## Resultado

**La infraestructura responde, pero la publicación no es confiable ante
concurrencia y recuperación.** Hay seis destinos con problemas de estado entre
96 intentos persistidos: 90 `published`, cuatro `pending` y dos `failed`.
Todos son historias de Instagram. No hay evidencia de falta de recursos ni de
interferencia de Notitas como causa de esos seis casos.

La causa comprobada de los cuatro pendientes es una carrera del reconciliador
con el publicador. El reconciliador puede borrar el identificador remoto mientras
el envío todavía corre, y dejar el destino pendiente sin trabajo que lo recupere.
**No está demostrado que esas cuatro historias no hayan salido en Instagram.**
Reenviarlas por su estado local puede duplicar contenido.

También se verificó un reintento manual que nunca se despacha porque su orden ya
está cerrada. Dos reproducciones locales confirman la pérdida de confirmación
por concurrencia y la omisión de timeouts por el reconciliador.

## Alcance y restricciones

- Inventario remoto de contenedores, recursos, redes, puertos, reloj, TLS,
  configuración, versiones, migraciones, backups y logs.
- Consultas PostgreSQL bajo `BEGIN READ ONLY` y timeout de diez segundos;
  proyecciones explícitas sin tokens, snapshots ni contenido personal de Notitas.
- Revisión del circuito programación → outbox → publicación → recuperación,
  alertas, controles de acceso e infraestructura de los dos repositorios.
- Lecturas autenticadas a Meta desde el contenedor; el token nunca salió del
  proceso. Sin renovación, reconexión, publicación ni cambios en la base.
- Compilación, lint, tipos y pruebas de Aramayo; tipos y pruebas de los tres
  paquetes propios de Notitas; avisos de dependencias.
- Se preservaron los cambios locales previos de ambos repositorios. Sólo se
  agregan este informe y su entrada en `STATUS.md`.

Esto es una auditoría operativa y de código enfocada por riesgo, no una
certificación de ausencia de defectos en cada línea. No se ejecutaron ataques,
pruebas de carga, restauraciones nuevas, escrituras E2E en producción ni una
revisión visual autenticada de cada pantalla. Tampoco se auditó línea por línea
el código upstream de SiYuan.

## Estado comprobado

| Área | Evidencia |
| --- | --- |
| Release de Content | `e1d93c55dd12a6bbf516c622fda17429f480ff42-notitas-20261005`; API/web/worker con imágenes `e1d93c5…` |
| Código revisado | Checkout `e640b2b`; sin diferencias de aplicación respecto de `e1d93c5`; hashes de transporte y reconciliador compilados idénticos al worker remoto |
| Notitas | SiYuan `3.8.6`, MCP `0.4.4`; ambos saludables |
| Servidor | 108 días encendido; carga 0,27; 5,6 GiB disponibles de 7,6 GiB; 42 GB libres, disco al 43 % |
| Procesos | Ocho contenedores activos, ninguno con reinicios automáticos ni `OOMKilled` en su estado actual |
| Worker | Activo desde 30/09; alrededor de 400 MiB; no tiene healthcheck Docker propio |
| PostgreSQL | 37 migraciones terminadas, ninguna incompleta |
| Redis | Aproximadamente 2,5 MiB de datos, persistencia RDB observada `ok` |
| Outbox | 274 mensajes entregados: 98 renders, 96 publicaciones, 80 despachos; ningún pendiente ni `dead_letter` en el corte |
| Programación | 80 ocurrencias despachadas y dos omitidas históricas del 24/09; cuatro reglas activas |
| Aislamiento | Notitas no pertenece a las redes de API/worker/base; Caddy es el único miembro común del ingreso |
| Exposición | Sólo SSH y Caddy en puertos públicos; PostgreSQL, Redis, SiYuan y MCP sin puertos publicados al host |
| Configuración | Compose `config --quiet` y Caddy `validate` aprobados; archivos privados con `600 root:root` |
| Reloj | NTP sincronizado; reglas con zona `America/Argentina/Cordoba` |
| Sistema operativo | Reinicio pendiente indicado por `/var/run/reboot-required`; no se ejecutó |

Pruebas HTTP: Content `200`, API `/health` y `/ready` `200`, publicaciones sin
sesión `401`, Notitas sin sesión `401`, `/mcp-health` `200`, MCP y listado de
cuadernos sin credencial `401`. HSTS presente. Desde la Mac, curl verificó TLS
con resultado `0`; Python local carecía de una cadena de confianza utilizable,
por lo que sus errores iniciales no se atribuyen al servidor.

Certificados comprobados con validación TLS: Content vence el 13/02/2027, API
el 12/02/2027 y Notitas el 04/01/2027 (fechas UTC de los certificados).

Meta respondió `200` a lectura de Page, cuenta de Instagram y cuota. La cuota
observada fue `0/100` en su ventana de 86.400 segundos. Esto confirma lectura y
capacidad disponible, no sustituye una prueba de publicación. El estado local
`healthy` no se había revisado desde el 16/09; no debe presentarse como una
comprobación reciente.

## Casos afectados

Horas convertidas a Argentina. Los IDs son internos y permiten revisar cada
caso sin recrear órdenes.

| Fecha y hora de la orden | Pieza | Publicación | Estado observado |
| --- | --- | --- | --- |
| 01/10 08:30 | Ya abrimos | `d3563cf1-001d-47dc-91ac-2222e9b79249` | `publishing`; destino `pending`, secuencia 2; reconciliado 08:30:11.717 |
| 03/10 08:30 | Ya abrimos | `68a7bd8f-bd42-444c-9e8d-60390c17df9a` | `publishing`; destino `pending`, secuencia 2; reconciliado 08:30:13.978 |
| 24/10 08:30 | Ya abrimos | `55c42b1b-575e-43dd-8dcc-9706c4837afe` | `publish_failed`; `permission-denied`, `permanent-failure`; conserva contenedor |
| 11/11 20:52 | Cerradura de seguridad angosta | `4e6e21aa-de6c-4998-8d21-6e9b820b3fba` | `publish_failed`; reintento marcado el 13/11 10:31:18, pero orden cerrada desde el 11/11 |
| 11/11 20:54 | Cerradura de seguridad angosta | `0d08672b-3490-4ec8-a4af-8e91af7a2724` | `publishing`; destino `pending`, secuencia 2; reconciliado 20:55:04.729 |
| 14/11 08:30 | Ya abrimos | `cda9d2a4-4481-411e-9373-fb974999d1e8` | `publishing`; destino `pending`, secuencia 2; reconciliado 08:30:07.753 |

Los cuatro `pending` no conservan `staged_media_id`, `remote_post_id` ni
`next_attempt_at`. Sus eventos originales ya están `delivered`, con un único
intento de outbox. Reiniciar el worker no vuelve a ponerlos en cola.

Los dos fallos guardan el mensaje normalizado «Meta no expone esa publicación a
esta conexión». En el adaptador ese texto corresponde al subcódigo `2207006`.
No se conservó aquí la respuesta original de Meta ni su combinación completa de
código/contexto. **No alcanza para concluir que venció el token o que faltan
permisos globales**: hubo publicaciones posteriores y las lecturas actuales
funcionan. Se requiere comprobación individual en Meta.

## Hallazgos de publicación

### A-01 · P1 · La reconciliación puede invalidar una publicación en curso

`openOutcomes()` selecciona inmediatamente destinos `media_staged`, sin excluir
los que están siendo enviados. El adaptador de consulta interpreta `FINISHED`
como ausencia y `reopenForRepublish()` incrementa la secuencia, borra el
contenedor y cambia el estado a `pending`.

Si el publicador ya está esperando `media_publish`, su confirmación intenta
guardar con la secuencia anterior y recibe `conflict`. El efecto remoto puede
haber ocurrido. La orden queda abierta y el outbox se declara entregado.

Evidencia exacta del 14/11, UTC:

1. `11:30:00.776`: orden `ce1c6ed3-c957-4f67-96eb-075c7df97d70` creada.
2. `11:30:06.908` y `11:30:07.326`: respuestas Graph de la ejecución original.
3. `11:30:07.753`: se escribe `reconciled_at`, secuencia 2, `pending` sin anclaje.
4. `11:30:07.759`: `publishing.reconcile reviewed=1 confirmed=0 republishable=1`.
5. `11:30:11.226`: termina otra llamada Graph de la ejecución original.
6. `11:30:11.237`: outbox confirmado `delivered`; la orden continúa abierta.

Los otros tres pendientes conservan la misma firma persistente. Se reprodujo
localmente con el publicador y reconciliador reales, un diario con control de
secuencia y un proveedor simulado: un envío remoto confirmado termina en
`conflict`, mientras el diario conserva `pending`, secuencia 2 y ningún ID remoto.

Corrección: exclusión persistente por destino entre envío y reconciliación;
conservar anclajes y resultados frente a conflictos; recuperar leases vencidas
con evidencia remota. Un retraso arbitrario del barrido reduce la frecuencia,
pero no garantiza exclusión. La lease de la ocurrencia no protege este tramo
posterior del envío.

Código: `publication-order-repository.ts:872`, `meta-publication-lookup.adapter.ts:107`,
`publication-reconciliation.service.ts:183`, `instagram-publisher.service.ts:276`.
Las rutas completas son `infrastructure/database/src/` para el repositorio y
`apps/worker/src/publishing/` para los servicios/adaptadores.

### A-02 · P1 · Reabrir un destino no crea trabajo para recuperarlo

`publication-order-repository.ts:1186` cambia a `pending`, pero escribe
`nextAttemptAt: null` y no crea outbox. El despachador sólo busca reintentos con
fecha; el reconciliador ya no selecciona `pending`. Así quedan abandonados los
cuatro casos anteriores aunque todos los procesos estén vivos.

Corrección: reanudación transaccional con intención durable y deduplicada,
después de resolver A-01. No reenviar masivamente los pendientes históricos:
perdieron información necesaria para descartar duplicados.

### A-03 · P1 · Los reintentos de órdenes cerradas nunca se despachan

El transporte cierra la orden al resolver sus destinos como fallidos.
`applyManualAction()` puede aceptar `retry` y asignar `next_attempt_at`, pero
`dispatchDueRetry()` devuelve `closed` si existe `settled_at`. No reabre la orden,
no reencola y tampoco limpia ese plan imposible.

Caso real: orden `80e13670-6460-4209-86b0-07c333f7a082`, cerrada el 11/11 a
`23:52:59.942Z`, reintento solicitado el 13/11 a `13:31:18.494Z`. Sigue vencido.
El worker registra repetidamente `publishing.retry.dispatch reviewed=1
dispatched=0 closed=1`. El mismo conflicto de ciclo de vida afecta a reintentos
automáticos que se planifiquen después del cierre.

Corrección: definir cierre terminal frente a fallo recuperable, reapertura
auditada y transición de la publicación. Probar reintento real contra PostgreSQL
y outbox; verificar que un destino ya publicado nunca se vuelva a enviar.

Código: `publication-order.transport.ts:179`, `publication-order-repository.ts:774`,
`:968` y `:1079`.

### A-04 · P1 · El reconciliador omite fallos ambiguos

El repositorio incluye `failed` con `request-timeout`/`processing-timeout` en
`openOutcomes()`. El servicio vuelve a filtrar llamando
`needsPublicationReconciliation(target.state)` sin `target.failureCode`; para
`failed` la función devuelve falso sin ese argumento.

Reproducción local: un destino `failed/request-timeout` y evidencia remota de
éxito producen `reviewed=1`, cero consultas y cero confirmaciones. Es un defecto
confirmado de código; no había un destino de esa clase en el corte de la base.

Corrección: pasar el código, conservar ambigüedad y comprobar cierre agregado
después de reconciliar, con pruebas del flujo completo y no sólo del helper.

Código: `publication-reconciliation.service.ts:109`,
`packages/domain/src/publication-retry.ts:282`.

### A-05 · P2 · Las alertas y los logs dejan puntos ciegos

- Las cuatro órdenes atascadas no generan alerta propia: no tienen
  `manual_reason` y sus ocurrencias ya están `dispatched`. La detección de atasco
  sólo busca ocurrencias `planned` en programaciones activas.
- `publication-order.transport.ts` absorbe cualquier excepción del publicador;
  si éste no pudo persistir el fallo, el evento aún puede terminar entregado.
- `instagram-graph.adapter.ts:394` observa sólo `fetch`; la validación HTTP y el
  parseo ocurren después. Por ello `graph.request outcome=success` no prueba
  aceptación de Meta. No se puede deducir publicación remota sólo de esos logs.
- Worker no tiene healthcheck propio en Compose; `/ready` de la API comprueba
  PostgreSQL/Redis, no progreso de publicación ni frescura de conexión Meta.

Corrección: alertar órdenes sin progreso independientemente de la ocurrencia y
del outbox; registrar conflictos y fallos normalizados; observar la operación
Graph completa; separar entrega del mensaje de resultado comercial confirmado.

## Dependencias y seguridad

`pnpm audit --prod --json` devuelve **36 avisos** en el grafo de Aramayo:
4 críticos, 16 altos, 13 moderados y 3 bajos. MCP de Notitas devuelve 15:
2 altos, 10 moderados y 3 bajos. Son avisos por dependencia, no una medición de
explotabilidad ni evidencia de intrusión.

En contenedores se comprobaron Next `16.3.5`, Sharp `0.35.4`/librsvg `2.62.91`,
Express `5.2.1`, proxy-addr `2.0.7`, body-parser `2.3.0` y qs `6.15.3`.

### A-06 · P1 · Revisar y actualizar dependencias productivas con avisos nuevos

Priorizar Sharp y los parsers HTTP utilizados; actualizar Next junto con su
matriz de compatibilidad. Los avisos consultados indican correcciones en Sharp
`>=0.35.5`, Next `>=16.4.1` para el conjunto observado, body-parser `>=2.4.0`,
proxy-addr `>=2.0.8`, qs `>=6.16.1` y Zod `>=4.6.6`. Validar nuevamente esos
rangos antes de preparar la release; no se modificaron lockfiles.

La aplicabilidad se debe evaluar por ruta:

- Next tiene la optimización de imágenes deshabilitada; sus avisos específicos
  de `/_next/image` no equivalen a una ruta expuesta en esta configuración.
- `ImageResponse` se usa para iconos con tamaños permitidos y contenido fijo,
  sin el SVG controlado por atacante que exige el aviso consultado.
- No se encontraron Server Actions ni funciones `use cache` en el código web
  revisado; los avisos condicionados a esas funciones requieren esa distinción.
- Parte del grafo reportado es tooling transitivo de Prisma; no se equipara a
  un servicio MySQL o servidor de desarrollo expuesto.
- El worker procesa imágenes con Sharp. El aviso de librsvg requiere evaluación
  de entradas SVG y condiciones del runtime; no se hizo una prueba de explotación.

Fuentes primarias consultadas el 15/11/2026:
[Sharp/librsvg](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w),
[Next ImageResponse](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j),
[Next Server Actions](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r).
La consulta directa a las páginas de contenedores/errores de Meta devolvió 429;
no se cambió su taxonomía basándose en documentación no verificable.

## Backups y convivencia con Notitas

### A-07 · P2 · Notitas necesita seguimiento de backups y copia externa reciente

El journal conserva **34 ejecuciones fallidas** y ningún archivo diario exitoso
entre el respaldo del 11/10 y el del 14/11 a `21:01Z`. El de ayer por la noche y
el de hoy a `07:16Z` sí terminaron con verificación y cifrado.

La revisión local de operaciones `0.1.1` documenta la corrección del ZIP vacío de
un cuaderno sin documentos y nuevas comprobaciones de espacio. Es trabajo previo
a esta auditoría; no se atribuye aquí su implementación. El hueco histórico y la
falta de aviso oportuno siguen siendo evidencia relevante aunque hoy esté sano.

Notitas ocupa aproximadamente 579 MB en `/var/lib/notitas` y 3,8 GB de backups.
Su servicio alcanzó picos de 2–2,7 GB durante las últimas copias. Detiene y vuelve
a arrancar sólo SiYuan para obtener una copia consistente; su arranque de hoy no
es evidencia de caída de Content. No se observaron OOM ni saturación asociados
a los horarios de publicación investigados.

El procedimiento de Notitas deja las copias diarias en el VPS hasta su descarga
manual. **No se verificó una copia externa reciente de Notitas.** Hace falta
registrar su fecha/destino y verificar una recuperación fuera del host, o
automatizar su envío conforme al destino autorizado. No borrar copias antiguas
como parte de esta auditoría.

Content sí conserva evidencia de hoy: backup cifrado de 73.138.197 bytes,
restauración verificada con 37 tablas y subida a Drive; `rclone` informa cero
diferencias. Ambos servicios de backup terminaron hoy con `Result=success`.

### A-08 · P2 · El ingreso compartido debe conservarse en cada promoción y rollback

Caddy es un punto de fallo compartido deliberado. La integración con Notitas
está en producción y sus archivos coinciden byte a byte con el checkout local,
pero los cambios de Compose/Caddy todavía no estaban versionados al comenzar.
Una release creada sólo desde el commit actual o un rollback anterior a Notitas
puede perder su red, montaje o import.

Corrección: incorporar la integración existente a una release revisada y probar
promoción/rollback con ambos dominios, MCP y protecciones sin sesión. Conservar
las redes y bases independientes. No hay motivo demostrado para separar ahora
ambos sistemas en VPS distintos.

Además, programar el reinicio pendiente del host con comprobación previa de
trabajos en vuelo y recuperación posterior; no se reinició durante esta revisión.

### A-09 · P2 · El estado documental mezcla históricos con afirmaciones actuales

`STATUS.md` todavía afirmaba que producción no tenía contenedores, secretos de
proveedores ni HTTPS de Notitas, en contradicción con apartados posteriores y
con la evidencia remota. El encabezado agregado en esta auditoría identifica el
corte vigente y advierte sobre esos históricos. Conviene consolidar el registro
operativo sin perder antecedentes y revisar las fases pendientes contra la
operación real; no se marcaron tareas completas por inferencia.

## Verificaciones realizadas

| Verificación | Resultado |
| --- | --- |
| `pnpm verify:stack`, `verify:plan`, `format:check`, `build`, `lint`, `typecheck` | Aprobadas en la secuencia `pnpm verify` |
| `pnpm test` | Aprobado; 1.209 pruebas, cero fallos, sumando workspaces y herramientas |
| `pnpm baseline:verify` | 33 fixtures y 33 referencias correctas |
| `pnpm smoke` | API, web y worker aprobados, con dobles y sin efectos externos |
| Reproducciones adicionales de reconciliación | 2/2 reprodujeron los defectos A-01 y A-04 |
| Notitas MCP | Typecheck y 82 pruebas aprobadas |
| Notitas plugin | Typecheck y siete suites aprobadas |
| Notitas operaciones | Typecheck y 11 pruebas aprobadas |
| Configuración remota y HTTPS | Aprobados, con rechazos `401` donde corresponde |
| Auditorías de dependencias | Ejecutadas; salida no cero por los avisos detallados |

La primera ejecución de pruebas de API/MCP no pudo abrir listeners por el
sandbox (`EPERM`); se repitieron con permiso de loopback y pasaron. No se atribuye
ese fallo al producto. La secuencia de calidad quedó cubierta por sus pasos,
sin afirmar que la primera invocación monolítica terminó en cero.

No se ejecutaron en esta auditoría `db:test`, E2E con navegador, regresión visual,
escáner de imágenes del sistema operativo ni pruebas de publicación real. Son
verificaciones necesarias de la corrección futura según el alcance, no pruebas
que puedan darse por realizadas a partir de los unit tests.

Evidencia local temporal de la sesión:

- `/tmp/aramayo-audit-verify.log`, `/tmp/aramayo-audit-tests.log`,
  `/tmp/aramayo-audit-smoke.log`.
- `/tmp/aramayo-audit-dependencies.json`, `/tmp/notitas-audit-dependencies.json`.
- `/tmp/aramayo-audit-reconciliation.test.ts`: usa clases reales con dobles;
  ejecutar con `pnpm exec node --test --test-name-pattern='AUDIT:'
  /tmp/aramayo-audit-reconciliation.test.ts`. Conserva las comprobaciones que
  reproducen el comportamiento defectuoso, no pruebas de una corrección.
- `/tmp/notitas-audit-tests-unrestricted.log`,
  `/tmp/notitas-plugin-audit-tests.log`, `/tmp/notitas-operations-audit-tests.log`.

## Orden de corrección y criterio de aceptación

1. Resolver A-01/A-02 juntos: exclusión persistente, preservación de anclajes,
   reanudación durable y control de ventana temporal. Probar dos ejecutores,
   reconciliación durante `media_publish`, reinicio y pérdida de confirmación.
2. Resolver A-03/A-04: reintento manual/automático desde fallo, timeout antes y
   después del efecto remoto, confirmación y cierre de la publicación agregada.
3. Agregar detección de órdenes atascadas, fallos de backup y observabilidad de
   resultado de negocio. Ningún pendiente huérfano debe quedar silencioso.
4. Preparar actualización de dependencias e infraestructura con pruebas,
   respaldo, rollback que conserve Notitas y smoke de ambos dominios.
5. Reconciliar los seis casos individualmente. Para historias antiguas, revisar
   el archivo/historial de Instagram si ya no son consultables por API. Registrar
   confirmación, ausencia comprobada o indeterminación; no cambiar estados a mano
   para que el tablero se vea limpio. Las aperturas vencidas no se publican hoy.
6. Comprobar copia externa reciente de Notitas y cerrar los pendientes operativos
   con evidencia, incluido el reinicio del host en una ventana adecuada.

No basta con reiniciar contenedores ni reconectar Meta: esas acciones no reparan
la carrera, las órdenes cerradas ni los destinos sin intención de transporte.

## Notas de progreso

- Fecha: 2026-11-15.
- Estado real: auditoría entregada; correcciones y recuperación de seis casos
  pendientes. Producción continúa con su comportamiento previo.
- Archivos modificados: este informe y la entrada inicial de `docs/STATUS.md`.
- Decisiones: conservar evidencia y estados remotos, no reenviar contenido
  histórico, no alterar el despliegue compartido durante el diagnóstico.
- Verificaciones: tabla anterior; validación documental final en esta sesión.
- Validación documental: Prettier, `pnpm verify:plan` (76 tareas en ocho fases)
  y `git diff --check` aprobados.
- Pendientes: pruebas de integración/concurrencia de las correcciones, release,
  reconciliación individual y evidencia externa de Notitas.
- Bloqueo del diagnóstico: ninguno. Para resolver el desenlace histórico hace
  falta evidencia de Instagram que la base local ya no conserva.
- Próximo paso exacto: implementar exclusión por destino y recuperación durable
  de A-01/A-02 con pruebas de concurrencia; después corregir cierre/reintento y
  timeouts antes de proponer una release productiva.

## Evidencia de cierre de la auditoría

- Commit: no se creó commit ni se modificó la release. Checkout inicial
  `e640b2b`, con cuatro archivos previamente modificados.
- Evidencia remota: inventario, lecturas SQL, línea temporal y respuestas HTTP
  resumidas arriba; hashes de código y configuración contrastados.
- Desviaciones: auditoría explícita fuera del avance secuencial de fases; no
  cierra `P5-T09`, `P6-T09`, `P7-T07` ni otra tarea pendiente.
