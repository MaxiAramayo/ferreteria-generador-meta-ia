-- Foto propia, imagen propia y color de acento de una apertura (`ADR-030`).
ALTER TYPE "recurring_story_design_variant" ADD VALUE IF NOT EXISTS 'imagen';

CREATE TYPE "recurring_story_accent" AS ENUM ('marca', 'senal', 'verde');

ALTER TABLE "recurring_story_rules"
  ADD COLUMN "accent" "recurring_story_accent" NOT NULL DEFAULT 'marca',
  ADD COLUMN "photo_data_url" TEXT,
  ADD COLUMN "photo_alt" VARCHAR(160),
  ADD COLUMN "photo_focus_y" SMALLINT,
  -- La foto se guarda entera o no se guarda, y sólo como JPEG o PNG en
  -- base64: el motor vuelve a comprobar los bytes antes de renderizar.
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
  ),
  -- La imagen propia sin imagen no tiene nada que publicar. Se compara como
  -- texto porque un valor recién agregado a un enum no puede usarse en la
  -- misma transacción que lo agregó.
  ADD CONSTRAINT "recurring_story_rules_own_image_check" CHECK (
    "design_variant"::text <> 'imagen' OR "photo_data_url" IS NOT NULL
  );
