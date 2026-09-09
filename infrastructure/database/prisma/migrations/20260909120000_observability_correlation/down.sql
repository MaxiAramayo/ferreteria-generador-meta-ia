DROP INDEX IF EXISTS "outbox_correlation_idx";
DROP INDEX IF EXISTS "audit_events_correlation_idx";

ALTER TABLE "outbox_messages"
  DROP CONSTRAINT IF EXISTS "outbox_messages_correlation_id_check",
  DROP COLUMN IF EXISTS "correlation_id";

ALTER TABLE "audit_events"
  DROP CONSTRAINT IF EXISTS "audit_events_correlation_id_check",
  DROP COLUMN IF EXISTS "correlation_id";
