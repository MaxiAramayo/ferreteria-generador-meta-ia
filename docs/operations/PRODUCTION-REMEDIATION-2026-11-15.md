# Corrección de producción — 2026-11-15

Pedido explícito del usuario: resolver los hallazgos de la
[auditoría](PRODUCTION-AUDIT-2026-11-15.md). Tarea `P7-T10`.

## Diseño y límites

- Antes del POST que publica, el publicador persiste `outcome_unknown` con
  comparación de secuencia. Sólo quien gana esa escritura puede enviar.
- Un proceso reiniciado nunca vuelve a enviar un destino incierto. Conserva el
  anclaje remoto y consulta; un contenedor listo no prueba ausencia después de
  que pudo iniciarse el envío.
- El reconciliador espera cinco minutos desde la última escritura, verifica
  también los códigos ambiguos y respeta el resultado de cada escritura CAS.
  La espera reduce interferencias; la seguridad depende del CAS y del estado,
  no del tiempo ni de un bloqueo en memoria.
- Reabrir un destino persiste una fecha de recuperación. El despachador cambia
  destino, orden, publicación y outbox en una transacción, conservando destinos
  exitosos. Una orden cancelada o sustituida por otra revisión no se reactiva.
- Confirmar un resultado remoto actualiza también el agregado. El cierre debe
  ser idempotente y no sobrescribir una revisión posterior.
- Los errores inesperados se propagan al outbox después de atender los demás
  destinos. Los resultados parciales permanecen registrados.
- Los seis casos históricos se revisan y aíslan antes de activar recuperación:
  no se reenvían aperturas vencidas ni historias sin evidencia de ausencia.
- Se conservan el ingreso compartido y los cambios previos de Notitas. Las
  copias externas reutilizan la infraestructura ya autorizada.

## Verificación prevista

Regresiones de concurrencia con envío pausado, caída antes/después del POST,
timeout, conflictos CAS, reintento de orden cerrada, publicación parcial,
revisión sustituida y alertas. Integración en una base aislada; `pnpm verify`;
auditoría de dependencias y pruebas de Notitas afectadas. Backup previo,
promoción reversible y comprobación remota de Content y Notitas.

## Notas de progreso

- Fecha: 2026-11-15.
- Estado real: Content desplegado en `1d30158a` y comprobado; seguimiento de Notitas pendiente.
- Archivos modificados: ver diff de `P7-T10`.
- Decisiones tomadas: reutilizar secuencias y estados existentes; no mantener
  transacciones abiertas durante llamadas HTTP ni introducir locks en memoria.
- Verificaciones ejecutadas: build, lint, typecheck, 1213 pruebas unitarias;
  87 pruebas de repositorios PostgreSQL; `pnpm db:test` completo con Redis local,
  migración desde cero, render/cola, down.sql y reaplicación; baseline 33 fixtures;
  smoke API/web/worker; `pnpm audit --prod` sin avisos conocidos.
  `pnpm verify` completo aprobado antes de promoción; regresión visual final
  de 114 piezas y tres suites E2E aprobadas.
- Verificaciones pendientes de Notitas: copia externa, dependencias propias y coordinación con sus cambios
  de operaciones 0.2.0 ya presentes en el checkout.
- Bloqueo, si existe: ninguno para la corrección; el resultado remoto de cinco
  historias históricas no se puede deducir de la base.
- Próximo paso exacto: verificar las remediaciones de Notitas y revisar evidencia
  remota de los históricos antes de cualquier reenvío. No reenviarlos automáticamente.
- Producción: `1d30158a`; rollback `e1d93c5…-notitas-20261005`. Sin migraciones
  nuevas; las protecciones auditadas se conservan también al revertir aplicación.
- Entorno de prueba: contenedores locales `aramayo-remediation-db` (55491) y
  `aramayo-remediation-redis` (55492), sin datos reales. No tocar los contenedores
  de ensayos de Notitas. Logs en `/tmp/aramayo-remediation-*.log`.
- Cambios previos: Caddy/Compose/VPS_OPERATIONS y parte de STATUS ya estaban
  modificados; se conservaron. Notitas tiene cambios adicionales de otro trabajo
  (backup-status/operaciones 0.2.0) y no se editó desde esta tarea.

## Evidencia del despliegue

Promoción completada; ver el registro final de esta página. `P7-T10` permanece
abierta por la verificación de remediaciones propias de Notitas.

## Dependencias verificadas

Next.js 16.4.1 ([release oficial](https://github.com/vercel/next.js/releases/tag/v16.4.1))
y Sharp 0.35.5 ([release oficial](https://github.com/lovell/sharp/releases/tag/v0.35.5)),
consultadas el 2026-11-15. Overrides acotados por major corrigen las transitivas.
La excepción es `@prisma/config>deepmerge-ts@8.0.0`: el
[release oficial](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)
corrige referencias circulares. Se comprobó que Prisma usa `deepmerge` sobre su
configuración de objetos; no usa los tipos renombrados ni Maps. Generación,
migraciones y rollback deben verificar la compatibilidad antes de promover.

## Preparación del despliegue autorizado

El usuario pidió desplegar a producción el 2026-11-15. La revisión final conserva
el esquema anterior: los destinos detenidos generan `publication-manual-action`
con causa `execution-not-completed` y acción `inspect-queue`, ya admitidas por la
versión desplegada. Se retiró la migración experimental del nuevo tipo de alerta
antes de publicar; no se aplicó en producción. Así el rollback de aplicación no
requiere borrar alertas ni revertir schema. Se agregaron regresiones de revisión
editada y confirmaciones concurrentes del agregado.


La protección puntual está en
[`protect-publication-history-20261115.sql`](../../infrastructure/production/tools/protect-publication-history-20261115.sql).
Se ejecuta con worker detenido, exige los seis estados y secuencias comprobados,
registra valores anteriores en auditoría y admite repetición sin efectos nuevos.
Cuatro destinos pierden la etiqueta engañosa `pending` y quedan inciertos; los dos
fallidos conservan su causa y evidencia, sin fecha de reintento. No crea órdenes,
mensajes outbox ni escrituras a Meta. Una discrepancia revierte la transacción.


Candidato verificado antes de promoción: `pnpm verify` completo y `pnpm db:test`
con 87 pruebas de repositorios, render/cola, rollback y reaplicación. El SQL de
protección pasó sobre tablas temporales con constraints reales y dos ejecuciones
consecutivas (seis auditorías, cuatro inciertos, ningún reintento). La revisión de
órdenes reemplazadas y confirmaciones concurrentes está cubierta. La fase de
build remoto y promoción queda en curso.


## Bloqueo de promoción — 2026-11-15 16:46 UTC

Candidato `f087b4c2cbb7ec035f184e83d1ad0a7cb5d98a7c`,
[PR #104](https://github.com/MaxiAramayo/ferreteria-generador-meta-ia/pull/104).
El [run CI 43737324425](https://github.com/MaxiAramayo/ferreteria-generador-meta-ia/actions/runs/43737324425)
terminó antes de ejecutar pasos: GitHub informó «The job was not started because
your account is locked due to a billing issue». No es un fallo de las pruebas.
No se integró main ni se inició el workflow de imágenes; la política exige ese
workflow. Se pidió desbloquear Actions o autorizar una excepción de construcción
local para esta promoción. La decisión está pendiente.

El Compose candidato y el Caddy real validan. Content y API ready responden 200;
Notitas mantiene 401 sin sesión y MCP health 200; TLS validado. Los seis estados
históricos siguen coincidiendo exactamente con el SQL ensayado y los 274 outbox
están entregados. No se detuvo ningún servicio ni se aplicó el SQL en producción.
Se inició el backup previo a las 16:46 UTC; el dump de 73.138.199 bytes y 37 tablas
quedó restaurado y cifrado a las 16:46:56. La comprobación de subida externa se
registra al finalizar el servicio.


El backup externo devolvió `0 differences found` y `14 matching files` durante
esta intervención. La unidad terminó a las 16:49:48 UTC con `Result=success` y
`ExecMainStatus=0`; la subida y retención están completas. Los únicos cambios locales posteriores a
`f087b4c` son estas notas y STATUS, pendientes de commit para evitar confundir el
SHA ya probado de la PR. No se creó ningún artefacto productivo fuera del workflow.


## Excepción autorizada para esta promoción

El 2026-11-15 el usuario autorizó explícitamente construir y verificar las imágenes
localmente para este despliegue ante el bloqueo de facturación de GitHub Actions.
Se mantiene el Dockerfile fijado, `linux/amd64`, cuatro imágenes por SHA, configuración
sin secretos durante build, validación local de contenedores y rollback. Las imágenes
se transfieren por SSH y se comparan por ID SHA-256 entre origen y VPS. No se requiere
cambiar credenciales ni facturación. Esta excepción no cambia la política para
promociones futuras; CI permanece bloqueado externamente.


## Hallazgo en ensayo de imágenes

La candidata `4841f826` compiló y pasó migración, readiness, web y Chromium,
pero la regresión visual dentro del worker falló al decodificar la foto de
catálogo. `pnpm deploy` excluía `packages/design-engine/assets` porque el
paquete declaraba únicamente `dist` en `files`. No se promovió esta candidata.
La corrección incluye los activos versionados y amplía el smoke productivo
para abrir y decodificar una foto y el logo desde el paquete desplegado.
Las suites E2E de publicación, recurrencias y despacho pasaron localmente.
La nueva candidata debe repetir build y regresión visual completa antes de
la promoción.


## Candidata final y ampliación de protección

Candidata `1d30158ae97cd2a1a2853b59dc331bc53b1b219f`, PR #104 y #105 integradas.
Build de las cuatro imágenes `linux/amd64` correcto. Ensayo aislado: migraciones,
readiness, web, heartbeat y Chromium correctos; foto y logo decodificados.
Regresión visual dentro de la imagen final: **114 piezas iguales a la línea base**,
Chromium 151.0.7922.34, 155 segundos. E2E de publicación, recurrencias y despacho
aprobados. Typecheck, lint y 10 pruebas de infraestructura aprobados.

Durante la pausa, la versión antigua dejó otro destino `pending`, secuencia 2,
sin anclaje remoto, después de entregar su outbox el 15/11 a las 20:00 UTC.
Destino `3480e4b2-74c5-4664-9249-7825182f955c`, orden
`512489be-fca9-4f36-84a2-3b5f6a56af83`. El
[SQL adicional](../../infrastructure/production/tools/protect-publication-history-20261115-follow-up.sql)
verifica estado, secuencia, orden y timestamp exactos; conserva auditoría y admite
repetición. Se ensayó dos veces sobre tablas temporales con constraints reales:
una auditoría y un destino incierto, sin reintento. Total a proteger: siete,
cinco inciertos y dos fallidos. No se infiere ausencia remota.

Backup renovado: `aramayo-production-20261116T012309Z.dump.age`, 74.071.133 bytes
del dump, 37 tablas y restauración verificada. Subida externa terminada a las
01:23:35 UTC con `Result=success`, `ExecMainStatus=0`, `0 differences found`
y `14 matching files`.


## Promoción completada — 2026-11-16 01:40 UTC

- Commit desplegado: `1d30158ae97cd2a1a2853b59dc331bc53b1b219f`. SQL adicional
  versionado en `f71969e`; no modifica las imágenes ni el esquema.
- Las cuatro imágenes cargadas en el VPS tienen los mismos IDs que las locales.
  Archivo: SHA-256 `7578184e61ea8a0fb90b138cb3d2ebcf10831c94e6c931ec9b5afe61e6c3ab94`,
  1.833.749.776 bytes. Se conservan en
  `/opt/aramayo-content/artifacts/1d30158ae97cd2a1a2853b59dc331bc53b1b219f/`
  como `images.tar.gz` e `images.txt`. No están publicadas en GHCR.
- La primera transferencia a `/tmp` falló al escribir; se movieron exclusivamente
  los artefactos de esta intervención a disco persistente, se reanudó y se
  comprobó el SHA-256 completo. No hubo cambios de servicios durante esa etapa.
- Smoke nativo del VPS: foto y logo decodificados y capturados por Chromium con
  filesystem de sólo lectura, red deshabilitada y sin credenciales.
- Worker detenido ordenadamente, cero trabajos activos y cero leases de
  ejecución. Los dos SQL de protección terminaron con COMMIT: siete auditorías,
  cinco destinos inciertos y dos fallidos sin fecha de reintento.
- Migración de la imagen nueva: 37 migraciones existentes, ninguna pendiente,
  código 0. API, web y worker recreados con `up --no-deps --pull never --wait`;
  sin reinicios ni OOM. Worker ready y heartbeat con PostgreSQL/Redis arriba.
- `current` apunta a la release nueva; env conserva `0600 root:root` y se cambian
  sólo `IMAGE_TAG` y `BUILD_DATE`. Copia anterior protegida en
  `/etc/aramayo-content/production.env.pre-1d30158a`.
- Caddy conserva el ID `ce3349c09d2ef3f66f30ea422c4bdb87c020c5dd505bb996bf1bef79a3074c2c`.
  PostgreSQL, Redis y los contenedores de Notitas no se recrearon en esta promoción.
- Base posterior: 90 destinos publicados, cinco inciertos y dos fallidos; 277
  outbox entregados, cero fechas de reintento histórico y 37 migraciones aplicadas.
  Siete alertas visibles: cinco `outcome-unresolved` y dos `permanent-failure`.
- HTTPS posterior: panel, privacidad, API health y ready 200; publicaciones sin
  sesión 401; Notitas privado 401 y MCP health 200. Verificación TLS correcta.

### Recuperación de esta release y rollback

La excepción local requiere cargar el archivo conservado con `docker load -i` y
usar `--pull never`; `docker compose pull` no puede obtener este SHA de GHCR.
Conservar el archivo y su manifiesto hasta publicar un reemplazo por el workflow.

Rollback de aplicación: detener worker, restaurar el env anterior y el enlace
`current` a `e1d93c55dd12a6bbf516c622fda17429f480ff42-notitas-20261005`, validar
Compose y recrear únicamente API/web/worker con sus imágenes retenidas. No
revertir el esquema ni las protecciones de históricos. Caddy conserva un bind
al Caddyfile de esa release anterior, idéntico al nuevo: no borrar su directorio
mientras el contenedor lo use. Comprobar ambos dominios y heartbeat después.

No se disparó ninguna publicación de prueba real ni se reenviaron históricos.
La revisión individual de los cinco desenlaces inciertos sigue pendiente.
