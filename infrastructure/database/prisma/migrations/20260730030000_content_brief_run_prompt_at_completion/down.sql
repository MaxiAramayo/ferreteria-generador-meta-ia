-- Volver a exigirlos obliga a descartar las ejecuciones pendientes, que por
-- definición todavía no tienen prompt ni esquema.
DELETE FROM "content_brief_runs" WHERE "prompt_version" IS NULL;

ALTER TABLE "content_brief_runs" ALTER COLUMN "prompt_version" SET NOT NULL;
ALTER TABLE "content_brief_runs" ALTER COLUMN "prompt_hash" SET NOT NULL;
ALTER TABLE "content_brief_runs" ALTER COLUMN "schema_version" SET NOT NULL;
