-- Revierte esta migración sola. La versión anterior del esquema no puede
-- representar una historia para todas las sucursales, así que esas reglas y
-- sus materializaciones se borran antes de restaurar las columnas
-- obligatorias, en el orden que exigen sus claves foráneas. Las piezas que
-- hubieran creado quedan como publicaciones comunes.
DELETE FROM "recurring_story_materializations"
WHERE "location_id" IS NULL
   OR "rule_id" IN (
     SELECT "id" FROM "recurring_story_rules" WHERE "location_id" IS NULL
   );

DELETE FROM "recurring_story_rules"
WHERE "location_id" IS NULL;

ALTER TABLE "recurring_story_materializations"
  DROP CONSTRAINT "recurring_story_materializations_location_scope_check";

ALTER TABLE "recurring_story_materializations"
  ALTER COLUMN "location_version" SET NOT NULL,
  ALTER COLUMN "location_id" SET NOT NULL;

ALTER TABLE "recurring_story_rules"
  ALTER COLUMN "location_id" SET NOT NULL;
