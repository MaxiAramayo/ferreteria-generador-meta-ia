ALTER TABLE "content_brief_runs"
  ADD COLUMN "completed_at" TIMESTAMPTZ(3),
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(3);

-- Las filas existentes se cerraron en el mismo instante en que se crearon.
UPDATE "content_brief_runs" SET "completed_at" = "created_at" WHERE "completed_at" IS NULL;

ALTER TABLE "content_brief_runs" DROP CONSTRAINT "content_brief_runs_outcome_check";

-- La base impide cualquier combinación que no describa un estado real: una
-- ejecución pendiente todavía no tiene resultado, una generada conserva su
-- brief, una rechazada su motivo y una cancelada su instante de cancelación.
ALTER TABLE "content_brief_runs"
  ADD CONSTRAINT "content_brief_runs_outcome_check" CHECK (
    (
      "status" = 'pending'
      AND "brief" IS NULL AND "rejection_code" IS NULL
      AND "completed_at" IS NULL AND "cancelled_at" IS NULL
    ) OR (
      "status" = 'generated'
      AND "brief" IS NOT NULL AND "rejection_code" IS NULL
      AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL
    ) OR (
      "status" = 'rejected'
      AND "brief" IS NULL AND "rejection_code" IS NOT NULL
      AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL
    ) OR (
      "status" = 'cancelled'
      AND "brief" IS NULL AND "rejection_code" IS NULL
      AND "cancelled_at" IS NOT NULL
    )
  );

CREATE INDEX "content_brief_runs_pending_idx"
  ON "content_brief_runs" ("organization_id", "status", "requested_at" DESC)
  WHERE "status" = 'pending';
