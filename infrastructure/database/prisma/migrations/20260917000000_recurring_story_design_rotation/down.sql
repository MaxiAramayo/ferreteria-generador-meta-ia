ALTER TABLE "recurring_story_rules"
  DROP CONSTRAINT IF EXISTS "recurring_story_rules_design_rotation_check",
  DROP COLUMN IF EXISTS "last_design_rotation_request_hash",
  DROP COLUMN IF EXISTS "last_design_rotation_idempotency_key",
  DROP COLUMN IF EXISTS "design_rotation";

DROP TYPE IF EXISTS "recurring_story_design_variant";
