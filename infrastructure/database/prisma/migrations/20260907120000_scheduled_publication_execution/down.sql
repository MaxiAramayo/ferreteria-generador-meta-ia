DROP INDEX IF EXISTS "publication_occurrences_execution_lease_idx";

ALTER TABLE "publication_schedule_occurrences"
  DROP CONSTRAINT IF EXISTS "publication_occurrences_execution_timestamps_check",
  DROP CONSTRAINT IF EXISTS "publication_occurrences_execution_lease_check",
  DROP COLUMN IF EXISTS "execution_completed_at",
  DROP COLUMN IF EXISTS "execution_started_at",
  DROP COLUMN IF EXISTS "execution_heartbeat_at",
  DROP COLUMN IF EXISTS "execution_lock_expires_at",
  DROP COLUMN IF EXISTS "execution_lock_token",
  DROP COLUMN IF EXISTS "execution_lock_owner";
