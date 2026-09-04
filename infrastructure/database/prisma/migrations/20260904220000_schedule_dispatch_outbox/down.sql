DROP INDEX IF EXISTS "publication_occurrences_global_due_idx";
DROP INDEX IF EXISTS "publication_occurrences_pending_dispatch_idx";
DROP INDEX IF EXISTS "publication_occurrences_dispatch_event_key";

ALTER TABLE "publication_schedule_occurrences"
  DROP CONSTRAINT IF EXISTS "publication_occurrences_dispatch_marker_check",
  DROP COLUMN IF EXISTS "dispatch_requested_at",
  DROP COLUMN IF EXISTS "dispatch_outbox_event_id";
