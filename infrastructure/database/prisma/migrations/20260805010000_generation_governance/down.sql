DROP TRIGGER IF EXISTS "generation_run_variants_media_requires_available" ON "generation_run_variants";
DROP FUNCTION IF EXISTS "require_available_generation_media"();
DROP TRIGGER IF EXISTS "publication_revisions_rendered_media_requires_available" ON "publication_revisions";
DROP FUNCTION IF EXISTS "require_available_rendered_media"();
DROP TRIGGER IF EXISTS "organizations_create_disabled_generation_policy" ON "organizations";
DROP FUNCTION IF EXISTS "create_disabled_generation_policy"();

DROP TABLE IF EXISTS "generation_budget_alerts";
DROP TABLE IF EXISTS "generation_attempts";

ALTER TABLE "generation_runs"
  DROP CONSTRAINT IF EXISTS "generation_runs_admission_check",
  DROP COLUMN IF EXISTS "reserved_cost_microusd",
  DROP COLUMN IF EXISTS "reference_cost_microusd",
  DROP COLUMN IF EXISTS "pricing_version",
  DROP COLUMN IF EXISTS "admission_reason",
  DROP COLUMN IF EXISTS "admission_mode";

DROP TABLE IF EXISTS "generation_policies";
DROP TYPE IF EXISTS "generation_attempt_status";
