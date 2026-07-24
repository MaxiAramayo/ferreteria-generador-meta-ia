# ADR-008: límites de PostgreSQL, Redis y Cloudinary

- Estado: aceptado
- Fecha: 2026-07-24

## Contexto

La plataforma maneja estado de negocio, trabajos efímeros y archivos pesados.
Solapar esas responsabilidades produciría pérdida de trazabilidad, publicaciones
duplicadas o referencias imposibles de reconciliar.

## Decisión

### PostgreSQL

Es la fuente canónica de publicaciones, versiones, aprobaciones, calendario,
destinos, sesiones, conexiones cifradas, metadatos de media, idempotencia,
outbox y auditoría.

### Redis compatible con BullMQ

Transporta trabajos, coordinación con TTL, rate limits y caché descartable. Un
reinicio o vaciado no puede perder una intención persistida ni una publicación
programada. El dispatcher reconstruye trabajos pendientes desde PostgreSQL.

### Cloudinary

Almacena originales y derivados binarios, entrega media pública y aplica
transformaciones aprobadas. PostgreSQL conserva `public_id`, versión, hash,
formato, dimensiones, origen, estado y relaciones. Una URL de Cloudinary no es
el único registro de un activo.

## Invariantes

- Primero se registra intención o reserva en PostgreSQL; luego se realiza la
  carga o el encolado externo.
- Efectos entre sistemas admiten estado pendiente, fallo y reconciliación.
- Borrar un registro no borra media remota de forma implícita.
- Un activo huérfano se detecta y elimina mediante un trabajo auditable y
  diferido.
- Una imagen que no decodifica o cuyo hash/dimensiones no coinciden hace fallar
  el flujo; no se publica un fallback silencioso.
- Redis puede persistir para mejorar recuperación, pero nunca se convierte en
  fuente de verdad.

## Alternativas descartadas

### Binarios en PostgreSQL

Aumentan backups, I/O y costo de restauración sin aportar una ventaja al flujo de
entrega pública.

### Estado de trabajos sólo en Redis

No permite reconstruir calendario, idempotencia ni auditoría después de una
pérdida de cola.

### Cloudinary como catálogo canónico

No modela aprobaciones, ownership, referencias de dominio ni transacciones con
la publicación.

## Consecuencias

- Cargas y eliminaciones son sagas pequeñas con reconciliación, no
  transacciones distribuidas.
- Backups de PostgreSQL preservan relaciones y estado, pero restaurar una pieza
  también requiere verificar referencias remotas.
- La política exacta de retención se cerrará antes de producción.

## Fuentes verificadas

- [Cloudinary Asset Management](https://cloudinary.com/documentation/dam_fundamentals)
- [BullMQ: idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
