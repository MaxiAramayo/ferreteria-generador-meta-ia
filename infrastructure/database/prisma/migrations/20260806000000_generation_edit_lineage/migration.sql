ALTER TABLE "generation_runs"
  ADD COLUMN "lineage_root_id" UUID,
  ADD COLUMN "parent_run_id" UUID,
  ADD COLUMN "parent_variant_id" UUID,
  ADD COLUMN "edit_kind" VARCHAR(20),
  ADD COLUMN "edit_instruction" VARCHAR(600),
  ADD COLUMN "selected_variant_id" UUID,
  ADD COLUMN "selected_at" TIMESTAMPTZ(3),
  ADD COLUMN "selected_by_membership_id" UUID,
  ADD COLUMN "selection_version" INTEGER NOT NULL DEFAULT 0;

UPDATE "generation_runs"
SET "lineage_root_id" = "id";

ALTER TABLE "generation_runs"
  ALTER COLUMN "lineage_root_id" SET NOT NULL,
  ADD CONSTRAINT "generation_runs_edit_check" CHECK (
    (
      "parent_run_id" IS NULL
      AND "parent_variant_id" IS NULL
      AND "edit_kind" IS NULL
      AND "edit_instruction" IS NULL
      AND "lineage_root_id" = "id"
    )
    OR
    (
      "parent_run_id" IS NOT NULL
      AND "parent_variant_id" IS NOT NULL
      AND "edit_kind" IN ('visual', 'factual')
      AND char_length("edit_instruction") BETWEEN 8 AND 600
      AND "lineage_root_id" <> "id"
    )
  ),
  ADD CONSTRAINT "generation_runs_selection_check" CHECK (
    "selection_version" >= 0
    AND (
      (
        "selected_variant_id" IS NULL
        AND "selected_at" IS NULL
        AND "selected_by_membership_id" IS NULL
      )
      OR
      (
        "selected_variant_id" IS NOT NULL
        AND "selected_at" IS NOT NULL
        AND "selected_by_membership_id" IS NOT NULL
        AND "selection_version" > 0
      )
    )
  );

ALTER TABLE "generation_runs"
  ADD CONSTRAINT "generation_runs_lineage_root_fkey"
  FOREIGN KEY ("organization_id", "lineage_root_id")
  REFERENCES "generation_runs"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_runs_parent_fkey"
  FOREIGN KEY ("organization_id", "parent_run_id")
  REFERENCES "generation_runs"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_runs_parent_variant_fkey"
  FOREIGN KEY ("organization_id", "parent_variant_id")
  REFERENCES "generation_run_variants"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_runs_selected_variant_fkey"
  FOREIGN KEY ("organization_id", "selected_variant_id")
  REFERENCES "generation_run_variants"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_runs_selected_by_fkey"
  FOREIGN KEY ("organization_id", "selected_by_membership_id")
  REFERENCES "organization_memberships"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "generation_runs_lineage_idx"
  ON "generation_runs" ("organization_id", "lineage_root_id", "requested_at", "id");

CREATE INDEX "generation_runs_parent_idx"
  ON "generation_runs" ("organization_id", "parent_run_id");
