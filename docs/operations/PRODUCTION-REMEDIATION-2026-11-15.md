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
- Estado real: corrección local implementada y verificada; no desplegada.
- Archivos modificados: ver diff de `P7-T10`.
- Decisiones tomadas: reutilizar secuencias y estados existentes; no mantener
  transacciones abiertas durante llamadas HTTP ni introducir locks en memoria.
- Verificaciones ejecutadas: build, lint, typecheck, 1213 pruebas unitarias;
  85 pruebas de repositorios PostgreSQL; `pnpm db:test` completo con Redis local,
  migración desde cero, render/cola, down.sql y reaplicación; baseline 33 fixtures;
  smoke API/web/worker; `pnpm audit --prod` sin avisos conocidos.
  `pnpm verify` se ejecutó hasta pruebas y se completaron los pasos restantes
  por separado después de ajustar la expectativa del código de timeout.
- Verificaciones pendientes: revisión final del diff, validación adicional de
  revisión sustituida y confirmación concurrente, build productivo y promoción.
  Notitas: copia externa, dependencias propias y coordinación con sus cambios
  de operaciones 0.2.0 ya presentes en el checkout.
- Bloqueo, si existe: ninguno para la corrección; el resultado remoto de cuatro
  historias antiguas no se puede deducir de la base.
- Próximo paso exacto: revisar el diff y las invariantes de publicación; preparar
  protección auditada de los seis históricos antes de desplegar. Después crear
  commit/PR, ejecutar CI y publicar imágenes por SHA con el workflow de main;
  backup, promoción reversible y verificación de ambos dominios. No reenviar
  históricos de forma automática.
- Producción: no modificada por esta remediación. La migración nueva y los
  parches de dependencias aún no están en el VPS. No hay commit ni PR nuevos.
- Entorno de prueba: contenedores locales `aramayo-remediation-db` (55491) y
  `aramayo-remediation-redis` (55492), sin datos reales. No tocar los contenedores
  de ensayos de Notitas. Logs en `/tmp/aramayo-remediation-*.log`.
- Cambios previos: Caddy/Compose/VPS_OPERATIONS y parte de STATUS ya estaban
  modificados; se conservaron. Notitas tiene cambios adicionales de otro trabajo
  (backup-status/operaciones 0.2.0) y no se editó desde esta tarea.

## Evidencia de cierre

Pendiente.

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
