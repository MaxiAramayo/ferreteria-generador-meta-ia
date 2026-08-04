-- PostgreSQL no admite quitar valores de un enum: la reversión recrea el tipo.
-- Exige que ninguna fila use los estados nuevos, así que primero se descartan.
DELETE FROM "content_brief_runs" WHERE "status" IN ('pending', 'cancelled');

ALTER TYPE "content_brief_run_status" RENAME TO "content_brief_run_status_old";
CREATE TYPE "content_brief_run_status" AS ENUM ('generated', 'rejected');
ALTER TABLE "content_brief_runs"
  ALTER COLUMN "status" TYPE "content_brief_run_status"
  USING ("status"::text::"content_brief_run_status");
DROP TYPE "content_brief_run_status_old";
