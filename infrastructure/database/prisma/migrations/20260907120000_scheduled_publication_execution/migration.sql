ALTER TABLE "publication_schedule_occurrences"
  ADD COLUMN "execution_lock_owner" VARCHAR(120),
  ADD COLUMN "execution_lock_token" UUID,
  ADD COLUMN "execution_lock_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "execution_heartbeat_at" TIMESTAMPTZ(3),
  ADD COLUMN "execution_started_at" TIMESTAMPTZ(3),
  ADD COLUMN "execution_completed_at" TIMESTAMPTZ(3);

-- Una lease es una unidad: nunca existe un token sin propietario, vencimiento
-- y último heartbeat. Al completar se libera entera.
ALTER TABLE "publication_schedule_occurrences"
  ADD CONSTRAINT "publication_occurrences_execution_lease_check"
    CHECK (
      (
        "execution_lock_owner" IS NULL
        AND "execution_lock_token" IS NULL
        AND "execution_lock_expires_at" IS NULL
        AND "execution_heartbeat_at" IS NULL
      )
      OR
      (
        "execution_lock_owner" IS NOT NULL
        AND "execution_lock_token" IS NOT NULL
        AND "execution_lock_expires_at" IS NOT NULL
        AND "execution_heartbeat_at" IS NOT NULL
        AND "execution_completed_at" IS NULL
      )
    ),
  ADD CONSTRAINT "publication_occurrences_execution_timestamps_check"
    CHECK (
      ("execution_completed_at" IS NULL OR "execution_started_at" IS NOT NULL)
      AND (
        "execution_completed_at" IS NULL
        OR "execution_completed_at" >= "execution_started_at"
      )
      AND (
        "execution_completed_at" IS NULL
        OR (
          "status" = 'dispatched'
          AND "publication_order_id" IS NOT NULL
          AND "dispatched_at" IS NOT NULL
        )
      )
    );

CREATE INDEX "publication_occurrences_execution_lease_idx"
  ON "publication_schedule_occurrences"("status", "execution_lock_expires_at")
  WHERE "status" = 'planned';
