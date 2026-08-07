DROP INDEX IF EXISTS "generation_runs_parent_idx";
DROP INDEX IF EXISTS "generation_runs_lineage_idx";

ALTER TABLE "generation_runs"
  DROP CONSTRAINT IF EXISTS "generation_runs_selected_by_fkey",
  DROP CONSTRAINT IF EXISTS "generation_runs_selected_variant_fkey",
  DROP CONSTRAINT IF EXISTS "generation_runs_parent_variant_fkey",
  DROP CONSTRAINT IF EXISTS "generation_runs_parent_fkey",
  DROP CONSTRAINT IF EXISTS "generation_runs_lineage_root_fkey",
  DROP CONSTRAINT IF EXISTS "generation_runs_selection_check",
  DROP CONSTRAINT IF EXISTS "generation_runs_edit_check",
  DROP COLUMN IF EXISTS "selection_version",
  DROP COLUMN IF EXISTS "selected_by_membership_id",
  DROP COLUMN IF EXISTS "selected_at",
  DROP COLUMN IF EXISTS "selected_variant_id",
  DROP COLUMN IF EXISTS "edit_instruction",
  DROP COLUMN IF EXISTS "edit_kind",
  DROP COLUMN IF EXISTS "parent_variant_id",
  DROP COLUMN IF EXISTS "parent_run_id",
  DROP COLUMN IF EXISTS "lineage_root_id";
