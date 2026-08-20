DROP INDEX IF EXISTS "publication_order_targets_manual_idx";
DROP INDEX IF EXISTS "publication_order_targets_retry_due_idx";

ALTER TABLE "publication_order_targets"
  DROP CONSTRAINT IF EXISTS "publication_order_targets_settled_idle_check",
  DROP CONSTRAINT IF EXISTS "publication_order_targets_pending_action_check",
  DROP CONSTRAINT IF EXISTS "publication_order_targets_manual_reason_format_check",
  DROP CONSTRAINT IF EXISTS "publication_order_targets_attempts_check";

ALTER TABLE "publication_order_targets"
  DROP COLUMN IF EXISTS "reconciled_at",
  DROP COLUMN IF EXISTS "manual_reason",
  DROP COLUMN IF EXISTS "next_attempt_at",
  DROP COLUMN IF EXISTS "attempts";
