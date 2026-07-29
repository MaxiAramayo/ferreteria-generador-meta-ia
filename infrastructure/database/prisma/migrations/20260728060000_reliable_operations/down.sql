DROP TRIGGER IF EXISTS "audit_events_append_only" ON "audit_events";
DROP FUNCTION IF EXISTS "reject_audit_event_mutation"();

DROP TABLE IF EXISTS "outbox_messages";
DROP TABLE IF EXISTS "idempotency_records";
DROP TABLE IF EXISTS "audit_events";

DROP TYPE IF EXISTS "outbox_message_status";
DROP TYPE IF EXISTS "idempotency_status";
