ALTER TABLE "publication_schedule_occurrences"
  ADD COLUMN "dispatch_outbox_event_id" UUID,
  ADD COLUMN "dispatch_requested_at" TIMESTAMPTZ(3);

-- Reaplicar después de un rollback recupera la marca desde el outbox que nunca
-- dejó de ser durable. Sin este backfill, la misma ocurrencia parecería nueva y
-- crearía otro evento aunque el anterior siguiera entregado.
UPDATE "publication_schedule_occurrences" AS "occurrence"
SET
  "dispatch_outbox_event_id" = "event"."id",
  "dispatch_requested_at" = "event"."created_at"
FROM (
  SELECT DISTINCT ON ("organization_id", "aggregate_id")
    "id",
    "organization_id",
    "aggregate_id",
    "created_at"
  FROM "outbox_messages"
  WHERE "topic" = 'scheduling.occurrence.dispatch:v1'
    AND "aggregate_type" = 'publication_schedule_occurrence'
  ORDER BY "organization_id", "aggregate_id", "created_at" DESC, "id" DESC
) AS "event"
WHERE "event"."organization_id" = "occurrence"."organization_id"
  AND "event"."aggregate_id" = "occurrence"."id"::text;

ALTER TABLE "publication_schedule_occurrences"
  ADD CONSTRAINT "publication_occurrences_dispatch_marker_check"
    CHECK (("dispatch_outbox_event_id" IS NULL) = ("dispatch_requested_at" IS NULL));

-- Un evento durable pertenece a una sola ocurrencia. La fila del outbox y esta
-- marca se crean en la misma transacción; no hay FK porque el outbox entregado
-- conserva su propia política de retención y puede purgarse después.
CREATE UNIQUE INDEX "publication_occurrences_dispatch_event_key"
  ON "publication_schedule_occurrences"("dispatch_outbox_event_id")
  WHERE "dispatch_outbox_event_id" IS NOT NULL;

-- Reconstruir Redis recorre sólo las ocurrencias que siguen esperando una
-- orden y ya tienen intención de despacho persistida.
CREATE INDEX "publication_occurrences_pending_dispatch_idx"
  ON "publication_schedule_occurrences"("status", "id")
  WHERE "status" = 'planned' AND "dispatch_outbox_event_id" IS NOT NULL;

-- El dispatcher es global al proceso y no conoce el tenant antes de reclamar;
-- el índice anterior de `P6-T01` empieza por organization_id y no sirve para
-- ordenar el backlog completo por vencimiento.
CREATE INDEX "publication_occurrences_global_due_idx"
  ON "publication_schedule_occurrences"("status", "scheduled_at", "created_at", "id")
  WHERE "status" = 'planned' AND "dispatch_outbox_event_id" IS NULL;
