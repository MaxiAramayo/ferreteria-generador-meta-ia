-- Correlación de extremo a extremo.
--
-- El identificador acompaña una intención desde la solicitud HTTP hasta el
-- trabajo que la ejecuta en otro proceso. Es opcional a propósito: las filas
-- escritas antes de esta migración, y cualquier trabajo interno sin solicitud
-- que lo origine, no pueden inventar una correlación.
--
-- La forma es fija —32 hexadecimales— y el CHECK la impone en la base, no sólo
-- en la aplicación: una correlación con texto libre volvería inútil el índice y
-- permitiría guardar contenido arbitrario del cliente.
ALTER TABLE "audit_events"
  ADD COLUMN "correlation_id" CHAR(32),
  ADD CONSTRAINT "audit_events_correlation_id_check"
    CHECK ("correlation_id" IS NULL OR "correlation_id" ~ '^[0-9a-f]{32}$');

ALTER TABLE "outbox_messages"
  ADD COLUMN "correlation_id" CHAR(32),
  ADD CONSTRAINT "outbox_messages_correlation_id_check"
    CHECK ("correlation_id" IS NULL OR "correlation_id" ~ '^[0-9a-f]{32}$');

CREATE INDEX "audit_events_correlation_idx"
  ON "audit_events" ("organization_id", "correlation_id", "occurred_at" DESC);

CREATE INDEX "outbox_correlation_idx"
  ON "outbox_messages" ("correlation_id", "created_at" DESC);
