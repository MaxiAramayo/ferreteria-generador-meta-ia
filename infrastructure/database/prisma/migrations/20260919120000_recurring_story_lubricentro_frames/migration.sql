-- Historia del lubricentro, marcos intercambiables y encuadre de la foto
-- (`ADR-030`).
ALTER TYPE "recurring_story_design_variant" ADD VALUE IF NOT EXISTS 'placa';
ALTER TYPE "recurring_story_design_variant" ADD VALUE IF NOT EXISTS 'esquina';
ALTER TYPE "recurring_story_design_variant" ADD VALUE IF NOT EXISTS 'ventana';
ALTER TYPE "recurring_story_theme" ADD VALUE IF NOT EXISTS 'lubricentro';

CREATE TYPE "recurring_story_kind" AS ENUM ('apertura', 'lubricentro');

ALTER TABLE "recurring_story_rules"
  ADD COLUMN "kind" "recurring_story_kind" NOT NULL DEFAULT 'apertura',
  ADD COLUMN "photo_focus_x" SMALLINT,
  ADD COLUMN "photo_zoom" SMALLINT;

-- El encuadre horizontal y el acercamiento nacen en el centro y sin acercar:
-- es exactamente lo que se venía componiendo con `focus.x = 50` y `zoom = 1`.
UPDATE "recurring_story_rules"
SET "photo_focus_x" = 50, "photo_zoom" = 100
WHERE "photo_data_url" IS NOT NULL;

-- El lubricentro funciona únicamente en casa central (`KN-004`): su historia
-- nombra una sucursal concreta y nunca «todas».
ALTER TABLE "recurring_story_rules"
  ADD CONSTRAINT "recurring_story_rules_lubricentro_location_check" CHECK (
    "kind"::text <> 'lubricentro' OR "location_id" IS NOT NULL
  );

-- La foto se guarda entera o no se guarda: el encuadre es parte de la foto.
ALTER TABLE "recurring_story_rules"
  DROP CONSTRAINT IF EXISTS "recurring_story_rules_photo_check",
  ADD CONSTRAINT "recurring_story_rules_photo_check" CHECK (
    (
      "photo_data_url" IS NULL
      AND "photo_alt" IS NULL
      AND "photo_focus_y" IS NULL
      AND "photo_focus_x" IS NULL
      AND "photo_zoom" IS NULL
    )
    OR (
      "photo_data_url" IS NOT NULL
      AND "photo_alt" IS NOT NULL
      AND "photo_focus_y" BETWEEN 0 AND 100
      AND "photo_focus_x" BETWEEN 0 AND 100
      AND "photo_zoom" BETWEEN 100 AND 250
      AND length("photo_data_url") <= 3000000
      AND "photo_data_url" ~ '^data:image/(jpeg|png);base64,'
    )
  );

-- Las composiciones «horario» y «locales» se unificaron en la plantilla estable
-- del cartel: las reglas que las usaban pasan al marco que hoy las compone.
UPDATE "recurring_story_rules"
SET "design_variant" = 'cartel',
    "design_rotation" = ARRAY_FILL('cartel'::"recurring_story_design_variant", ARRAY[7])
WHERE "design_variant"::text IN ('horario', 'locales');
