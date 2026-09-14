-- Revierte esta migración sola: quita el marco y el copy editables y
-- restaura la restricción anterior, que sólo admitía `visual` y `factual`.
-- Como en `20260806000000_generation_edit_lineage`, revertir una migración
-- aditiva no intenta preservar filas que ya usaran la forma nueva -- acá,
-- una edición `composition` -- porque la versión anterior del esquema no
-- tiene ninguna forma de representarla sin instrucción. Se borran antes de
-- restaurar la restricción anterior: si quedaran, esa restricción las
-- rechazaría igual, y en el orden que exigen sus claves foráneas.
DELETE FROM "generation_attempts"
WHERE "run_id" IN (
  SELECT "id" FROM "generation_runs" WHERE "edit_kind" = 'composition'
);

DELETE FROM "generation_run_variants"
WHERE "run_id" IN (
  SELECT "id" FROM "generation_runs" WHERE "edit_kind" = 'composition'
);

DELETE FROM "generation_runs"
WHERE "edit_kind" = 'composition';

ALTER TABLE "generation_runs"
  DROP CONSTRAINT IF EXISTS "generation_runs_edit_check";

ALTER TABLE "generation_runs"
  DROP COLUMN IF EXISTS "edit_copy",
  DROP COLUMN IF EXISTS "edit_layout";

ALTER TABLE "generation_runs"
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
  );
