# Operaciones confiables

## Garantía

La plataforma usa PostgreSQL para idempotencia, auditoría y outbox. La entrega
es **at-least-once**: un mensaje puede llegar más de una vez si el proceso cae
después de entregarlo y antes de confirmar el lease. Cada consumidor debe
deduplicar por `eventId`; no se promete exactly-once.

Una mutación que produzca trabajo asíncrono debe usar una única transacción para
confirmar:

1. cambio de negocio;
2. resultado idempotente;
3. evento de auditoría;
4. mensajes outbox.

Reclamar y completar una clave en requests separados no sustituye esa unidad
transaccional. `POST /publications` y `PATCH /publications/:publicationId`
adoptan esta unidad: publicación/revisión, respuesta idempotente, auditoría y
outbox se escriben con el mismo `Prisma.TransactionClient`.

Ambos endpoints requieren `Idempotency-Key`. El cliente debe generar una clave
opaca de 16 a 200 caracteres sin espacios y reutilizarla sólo al reintentar la
misma intención.

## Idempotencia

- La clave legible nunca se persiste; se guarda SHA-256.
- El scope único es organización, actor, operación y hash de clave.
- El request conserva otro SHA-256. Reutilizar la clave con un payload distinto
  es conflicto.
- Una operación `processing` usa un lease de cinco minutos. Si el proceso cae
  antes del commit, el mismo scope puede reclamarla después del vencimiento.
- Al completar, el vencimiento se extiende a 24 horas. La respuesta se
  reproduce sin volver a ejecutar la intención.
- La limpieza automática sólo elimina filas `completed` vencidas, en lotes de
  hasta 1000; nunca elimina una operación activa o ambigua.

## Auditoría

`audit_events` es append-only por trigger. Conserva actor cuando existe,
operación, entidad, resultado, hora y metadata acotada. La validación rechaza
campos cuyos nombres indiquen token, sesión, cookie, credencial, contraseña,
secreto o autorización, incluso si están anidados.

Retención inicial: dos años. No existe borrado automático durante el piloto.
Antes de habilitarlo se requiere exportación verificable, aprobación de
seguridad y un procedimiento que no rompa investigaciones ni obligaciones
legales.

## Outbox

- El dispatcher reclama con `FOR UPDATE SKIP LOCKED`.
- Cada lease dura 60 segundos y pertenece a un `workerId`.
- Un lease vencido vuelve a ser elegible; el mismo `eventId` se conserva.
- Los fallos usan backoff exponencial con tope de 15 minutos.
- Después de 12 intentos el mensaje queda `dead_letter`.
- Sólo mensajes `delivered` pueden limpiarse automáticamente. Retención inicial:
  30 días; `pending`, `processing` y `dead_letter` requieren resolución antes
  de borrarse.

Un proveedor real no se configura en esta fase. El transporte deshabilitado
falla explícitamente y no simula una entrega exitosa.

## Inspección operativa

Un flujo de borrador correcto deja, con el mismo `organization_id`:

- una publicación y su revisión;
- un `idempotency_record` en `completed`;
- un `audit_event` con operación `content.publication:create` o
  `content.publication:update`;
- un `outbox_message` `pending` con `eventId` estable.

La inspección debe hacerse por identificadores, estado, operación y tiempos. No
se deben volcar cuerpos completos ni hashes a logs operativos. Para simular una
caída entre commit y entrega, se deja el mensaje `pending` o se vence su lease
`processing`; el siguiente `claimBatch` lo recupera sin crear un nuevo evento.
