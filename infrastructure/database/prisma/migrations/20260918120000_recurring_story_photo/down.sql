ALTER TABLE "recurring_story_rules"
  DROP CONSTRAINT IF EXISTS "recurring_story_rules_own_image_check",
  DROP CONSTRAINT IF EXISTS "recurring_story_rules_photo_check",
  DROP COLUMN IF EXISTS "photo_focus_y",
  DROP COLUMN IF EXISTS "photo_alt",
  DROP COLUMN IF EXISTS "photo_data_url",
  DROP COLUMN IF EXISTS "accent";

DROP TYPE IF EXISTS "recurring_story_accent";

-- PostgreSQL no quita un valor de un enum: se recrea el tipo sin `imagen`. Una
-- regla con imagen propia vuelve al cartel, que no necesita la foto.
ALTER TABLE "recurring_story_rules"
  ALTER COLUMN "design_variant" DROP DEFAULT,
  ALTER COLUMN "design_rotation" DROP DEFAULT;

ALTER TYPE "recurring_story_design_variant"
  RENAME TO "recurring_story_design_variant_with_image";

CREATE TYPE "recurring_story_design_variant" AS ENUM ('cartel', 'horario', 'locales');

ALTER TABLE "recurring_story_rules"
  ALTER COLUMN "design_variant" TYPE "recurring_story_design_variant"
    USING (
      CASE
        WHEN "design_variant"::text = 'imagen' THEN 'cartel'
        ELSE "design_variant"::text
      END
    )::"recurring_story_design_variant",
  ALTER COLUMN "design_rotation" TYPE "recurring_story_design_variant"[]
    USING (
      array_replace("design_rotation"::text[], 'imagen', 'cartel')
    )::"recurring_story_design_variant"[];

ALTER TABLE "recurring_story_rules"
  ALTER COLUMN "design_variant" SET DEFAULT 'cartel',
  ALTER COLUMN "design_rotation" SET DEFAULT ARRAY[
    'cartel'::"recurring_story_design_variant",
    'horario'::"recurring_story_design_variant",
    'locales'::"recurring_story_design_variant",
    'cartel'::"recurring_story_design_variant",
    'horario'::"recurring_story_design_variant",
    'locales'::"recurring_story_design_variant",
    'cartel'::"recurring_story_design_variant"
  ];

DROP TYPE "recurring_story_design_variant_with_image";
