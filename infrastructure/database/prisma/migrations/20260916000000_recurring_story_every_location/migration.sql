-- Una historia recurrente puede ser para todas las sucursales activas: la
-- regla no nombra sucursal y la historia del día lleva el horario de cada
-- una. `location_id` nulo significa eso, en la regla y en su
-- materialización; la versión de sucursal sólo tiene sentido cuando hay una,
-- así que va nula junto con ella. La clave foránea compuesta admite el nulo
-- por la regla de coincidencia simple de PostgreSQL.
ALTER TABLE "recurring_story_rules"
  ALTER COLUMN "location_id" DROP NOT NULL;

ALTER TABLE "recurring_story_materializations"
  ALTER COLUMN "location_id" DROP NOT NULL,
  ALTER COLUMN "location_version" DROP NOT NULL;

ALTER TABLE "recurring_story_materializations"
  ADD CONSTRAINT "recurring_story_materializations_location_scope_check" CHECK (
    ("location_id" IS NULL) = ("location_version" IS NULL)
  );
