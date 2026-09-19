CREATE TYPE "recurring_story_theme" AS ENUM ('taller', 'claro', 'promo');

ALTER TABLE "recurring_story_rules"
  ADD COLUMN "design_variant" "recurring_story_design_variant" NOT NULL DEFAULT 'cartel',
  ADD COLUMN "theme" "recurring_story_theme" NOT NULL DEFAULT 'taller',
  ADD COLUMN "last_visual_style_idempotency_key" VARCHAR(128),
  ADD COLUMN "last_visual_style_request_hash" CHAR(64);

-- Conserva el primer diseño previamente configurado como estilo de la regla.
-- `design_rotation` queda durante una release como compatibilidad de rollback;
-- el dominio nuevo ya no lo expone ni lo interpreta como rotación.
UPDATE "recurring_story_rules"
SET "design_variant" = COALESCE("design_rotation"[1], 'cartel'::"recurring_story_design_variant");
