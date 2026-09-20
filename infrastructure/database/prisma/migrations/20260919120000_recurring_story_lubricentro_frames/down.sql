-- Vuelve al cartel de la apertura, sin marcos ni encuadre.
ALTER TABLE "recurring_story_rules"
  DROP CONSTRAINT IF EXISTS "recurring_story_rules_lubricentro_location_check",
  DROP CONSTRAINT IF EXISTS "recurring_story_rules_photo_check",
  ADD CONSTRAINT "recurring_story_rules_photo_check" CHECK (
    (
      "photo_data_url" IS NULL
      AND "photo_alt" IS NULL
      AND "photo_focus_y" IS NULL
    )
    OR (
      "photo_data_url" IS NOT NULL
      AND "photo_alt" IS NOT NULL
      AND "photo_focus_y" BETWEEN 0 AND 100
      AND length("photo_data_url") <= 3000000
      AND "photo_data_url" ~ '^data:image/(jpeg|png);base64,'
    )
  );

-- Una regla del lubricentro vuelve a ser una apertura de esa sucursal: sin la
-- columna no hay dónde guardar de qué historia era.
ALTER TABLE "recurring_story_rules"
  DROP COLUMN IF EXISTS "photo_zoom",
  DROP COLUMN IF EXISTS "photo_focus_x",
  DROP COLUMN IF EXISTS "kind";

DROP TYPE IF EXISTS "recurring_story_kind";

-- PostgreSQL no quita un valor de un enum: se recrean los tipos sin los marcos
-- nuevos ni la paleta del lubricentro.
ALTER TABLE "recurring_story_rules"
  ALTER COLUMN "design_variant" DROP DEFAULT,
  ALTER COLUMN "design_rotation" DROP DEFAULT,
  ALTER COLUMN "theme" DROP DEFAULT;

ALTER TYPE "recurring_story_design_variant"
  RENAME TO "recurring_story_design_variant_with_frames";

CREATE TYPE "recurring_story_design_variant" AS ENUM ('cartel', 'horario', 'locales', 'imagen');

ALTER TABLE "recurring_story_rules"
  ALTER COLUMN "design_variant" TYPE "recurring_story_design_variant"
    USING (
      CASE
        WHEN "design_variant"::text IN ('placa', 'esquina', 'ventana') THEN 'cartel'
        ELSE "design_variant"::text
      END
    )::"recurring_story_design_variant",
  ALTER COLUMN "design_rotation" TYPE "recurring_story_design_variant"[]
    USING (
      array_replace(
        array_replace(
          array_replace("design_rotation"::text[], 'placa', 'cartel'),
          'esquina', 'cartel'
        ),
        'ventana', 'cartel'
      )
    )::"recurring_story_design_variant"[];

DROP TYPE "recurring_story_design_variant_with_frames";

ALTER TYPE "recurring_story_theme" RENAME TO "recurring_story_theme_with_lubricentro";

CREATE TYPE "recurring_story_theme" AS ENUM ('taller', 'claro', 'promo');

ALTER TABLE "recurring_story_rules"
  ALTER COLUMN "theme" TYPE "recurring_story_theme"
    USING (
      CASE
        WHEN "theme"::text = 'lubricentro' THEN 'taller'
        ELSE "theme"::text
      END
    )::"recurring_story_theme";

DROP TYPE "recurring_story_theme_with_lubricentro";

ALTER TABLE "recurring_story_rules"
  ALTER COLUMN "design_variant" SET DEFAULT 'cartel',
  ALTER COLUMN "theme" SET DEFAULT 'taller',
  ALTER COLUMN "design_rotation" SET DEFAULT ARRAY[
    'cartel'::"recurring_story_design_variant",
    'horario'::"recurring_story_design_variant",
    'locales'::"recurring_story_design_variant",
    'cartel'::"recurring_story_design_variant",
    'horario'::"recurring_story_design_variant",
    'locales'::"recurring_story_design_variant",
    'cartel'::"recurring_story_design_variant"
  ];
