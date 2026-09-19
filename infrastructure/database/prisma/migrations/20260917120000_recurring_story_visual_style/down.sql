ALTER TABLE "recurring_story_rules"
  DROP COLUMN IF EXISTS "last_visual_style_request_hash",
  DROP COLUMN IF EXISTS "last_visual_style_idempotency_key",
  DROP COLUMN IF EXISTS "theme",
  DROP COLUMN IF EXISTS "design_variant";

DROP TYPE IF EXISTS "recurring_story_theme";
