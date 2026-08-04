-- Revertir el ciclo de vida deja al historial sin forma de representar una
-- ejecución pendiente o cancelada, así que esas filas se descartan primero.
DELETE FROM "content_brief_runs" WHERE "status" IN ('pending', 'cancelled');

DROP INDEX IF EXISTS "content_brief_runs_pending_idx";

ALTER TABLE "content_brief_runs" DROP CONSTRAINT "content_brief_runs_outcome_check";
ALTER TABLE "content_brief_runs" DROP COLUMN "cancelled_at";
ALTER TABLE "content_brief_runs" DROP COLUMN "completed_at";

ALTER TABLE "content_brief_runs"
  ADD CONSTRAINT "content_brief_runs_outcome_check" CHECK (
    ("status" = 'generated' AND "brief" IS NOT NULL AND "rejection_code" IS NULL)
    OR
    ("status" = 'rejected' AND "brief" IS NULL AND "rejection_code" IS NOT NULL)
  );
