-- Se revierte en orden inverso: primero lo que depende de las columnas nuevas y
-- al final las columnas. El check de resultado vuelve a su forma original, la
-- que exige base para toda variante que salió.
--
-- El orden importa y no es cosmético: **todas** las restricciones nuevas se
-- sueltan antes de tocar una sola fila. Descartar las variantes deterministas
-- con el check de composición todavía activo violaría ese mismo check, porque
-- deja una fila con pieza y sin estado `succeeded`.

DROP INDEX IF EXISTS "generation_run_variants_composed_asset_idx";

ALTER TABLE "generation_run_variants"
  DROP CONSTRAINT IF EXISTS "generation_run_variants_composed_asset_fkey";

ALTER TABLE "generation_run_variants"
  DROP CONSTRAINT IF EXISTS "generation_run_variants_outcome_check";

ALTER TABLE "generation_run_variants"
  DROP CONSTRAINT IF EXISTS "generation_run_variants_deterministic_check";

ALTER TABLE "generation_run_variants"
  DROP CONSTRAINT IF EXISTS "generation_run_variants_composition_status_check";

ALTER TABLE "generation_run_variants"
  DROP CONSTRAINT IF EXISTS "generation_run_variants_composition_check";

ALTER TABLE "generation_run_variants"
  DROP CONSTRAINT IF EXISTS "generation_run_variants_source_check";

-- Una variante determinista no sobrevive a la reversión: sin columnas de
-- composición no tiene activo ni pieza que mostrar, así que se descarta en
-- lugar de quedar como una fila que el check original rechazaría.
UPDATE "generation_run_variants"
  SET "status" = 'discarded',
      "completed_at" = COALESCE("completed_at", CURRENT_TIMESTAMP)
  WHERE "source" = 'deterministic' AND "status" = 'succeeded';

ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_outcome_check" CHECK (
    (
      "status" = 'pending'
      AND "media_asset_id" IS NULL AND "sha256" IS NULL
      AND "failure_code" IS NULL AND "completed_at" IS NULL
    ) OR (
      "status" = 'succeeded'
      AND "media_asset_id" IS NOT NULL AND "sha256" IS NOT NULL
      AND "width" IS NOT NULL AND "height" IS NOT NULL
      AND "model" IS NOT NULL
      AND "failure_code" IS NULL AND "completed_at" IS NOT NULL
    ) OR (
      "status" = 'failed'
      AND "media_asset_id" IS NULL AND "sha256" IS NULL
      AND "failure_code" IS NOT NULL AND "failure_detail" IS NOT NULL
      AND "failure_correction" IS NOT NULL AND "completed_at" IS NOT NULL
    ) OR (
      "status" = 'discarded'
      AND "media_asset_id" IS NULL AND "sha256" IS NULL
      AND "failure_code" IS NULL AND "completed_at" IS NOT NULL
    )
  );

ALTER TABLE "generation_run_variants"
  DROP COLUMN IF EXISTS "composition_overlay_hash",
  DROP COLUMN IF EXISTS "composition_hash",
  DROP COLUMN IF EXISTS "composition_version",
  DROP COLUMN IF EXISTS "composition_theme",
  DROP COLUMN IF EXISTS "composition_layout",
  DROP COLUMN IF EXISTS "composed_height",
  DROP COLUMN IF EXISTS "composed_width",
  DROP COLUMN IF EXISTS "composed_sha256",
  DROP COLUMN IF EXISTS "composed_media_asset_id",
  DROP COLUMN IF EXISTS "source";
