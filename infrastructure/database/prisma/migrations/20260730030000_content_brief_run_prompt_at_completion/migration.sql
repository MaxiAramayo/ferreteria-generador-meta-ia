-- El prompt y el esquema describen lo que ejecutó, no lo que se pidió. Una
-- ejecución pendiente todavía no eligió ninguno, así que dejan de ser
-- obligatorios y se completan al cerrar.
ALTER TABLE "content_brief_runs" ALTER COLUMN "prompt_version" DROP NOT NULL;
ALTER TABLE "content_brief_runs" ALTER COLUMN "prompt_hash" DROP NOT NULL;
ALTER TABLE "content_brief_runs" ALTER COLUMN "schema_version" DROP NOT NULL;
