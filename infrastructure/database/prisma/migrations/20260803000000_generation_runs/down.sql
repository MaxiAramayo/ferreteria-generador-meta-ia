-- Las variantes se borran primero: referencian el lote y los activos, y sin
-- ellas el lote no conserva ningún resultado que valga la pena mantener.
DROP TABLE IF EXISTS "generation_run_variants";
DROP TABLE IF EXISTS "generation_runs";

DROP TYPE IF EXISTS "generation_variant_status";
DROP TYPE IF EXISTS "generation_run_status";
