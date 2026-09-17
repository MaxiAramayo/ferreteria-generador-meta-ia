CREATE TYPE "recurring_story_design_variant" AS ENUM ('cartel', 'horario', 'locales');

ALTER TABLE "recurring_story_rules"
  ADD COLUMN "design_rotation" "recurring_story_design_variant"[] NOT NULL
    DEFAULT ARRAY[
      'cartel'::"recurring_story_design_variant",
      'horario'::"recurring_story_design_variant",
      'locales'::"recurring_story_design_variant",
      'cartel'::"recurring_story_design_variant",
      'horario'::"recurring_story_design_variant",
      'locales'::"recurring_story_design_variant",
      'cartel'::"recurring_story_design_variant"
    ],
  ADD COLUMN "last_design_rotation_idempotency_key" VARCHAR(128),
  ADD COLUMN "last_design_rotation_request_hash" CHAR(64),
  ADD CONSTRAINT "recurring_story_rules_design_rotation_check"
    CHECK (cardinality("design_rotation") = 7);
