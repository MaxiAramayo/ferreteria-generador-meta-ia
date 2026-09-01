CREATE TYPE "publication_schedule_kind" AS ENUM (
  'once',
  'daily',
  'weekly',
  'monthly'
);

CREATE TYPE "publication_schedule_status" AS ENUM (
  'active',
  'paused',
  'cancelled',
  'expired',
  'completed'
);

CREATE TYPE "publication_occurrence_status" AS ENUM (
  'planned',
  'skipped',
  'cancelled',
  'dispatched'
);

CREATE TYPE "publication_occurrence_resolution" AS ENUM (
  'exact',
  'ambiguous',
  'shifted'
);

CREATE TYPE "publication_schedule_gap_policy" AS ENUM (
  'next_valid',
  'skip'
);

CREATE TYPE "publication_missed_policy" AS ENUM (
  'run_late',
  'skip'
);

CREATE TYPE "publication_month_day_overflow" AS ENUM (
  'clamp',
  'skip'
);

CREATE TABLE "publication_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "publication_id" UUID NOT NULL,
  "approval_snapshot_id" UUID NOT NULL,
  "created_by_membership_id" UUID NOT NULL,
  "kind" "publication_schedule_kind" NOT NULL,
  "status" "publication_schedule_status" NOT NULL DEFAULT 'active',
  "targets" "publication_target_kind"[] NOT NULL,
  "time_zone" VARCHAR(80) NOT NULL,
  "local_time" CHAR(5) NOT NULL,
  "effective_from" TIMESTAMPTZ(3) NOT NULL,
  "effective_until" TIMESTAMPTZ(3),
  "recurrence_interval" INTEGER,
  "weekdays" INTEGER[] NOT NULL DEFAULT '{}',
  "month_day" INTEGER,
  "month_day_overflow" "publication_month_day_overflow",
  "gap_policy" "publication_schedule_gap_policy" NOT NULL DEFAULT 'skip',
  "missed_policy" "publication_missed_policy" NOT NULL DEFAULT 'skip',
  "late_tolerance_minutes" INTEGER NOT NULL DEFAULT 0,
  "paused_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "cancelled_reason_code" VARCHAR(80),
  "expired_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publication_schedules_pkey" PRIMARY KEY ("id"),
  -- Una programación sin destino no es una intención: es una fila muerta que el
  -- dispatcher levantaría para no hacer nada.
  -- `cardinality` y no `array_length`: sobre un arreglo vacío `array_length`
  -- devuelve NULL, y un CHECK que evalúa NULL **no** se viola. La restricción
  -- habría dejado pasar exactamente el caso que existe para impedir.
  CONSTRAINT "publication_schedules_targets_check"
    CHECK (cardinality("targets") >= 1),
  CONSTRAINT "publication_schedules_local_time_check"
    CHECK ("local_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "publication_schedules_window_check"
    CHECK ("effective_until" IS NULL OR "effective_until" >= "effective_from"),
  CONSTRAINT "publication_schedules_tolerance_check"
    CHECK ("late_tolerance_minutes" BETWEEN 0 AND 1440),
  CONSTRAINT "publication_schedules_interval_range_check"
    CHECK ("recurrence_interval" IS NULL
           OR "recurrence_interval" BETWEEN 1 AND 52),
  CONSTRAINT "publication_schedules_weekday_range_check"
    CHECK ("weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]),
  -- Cada frecuencia usa exactamente sus campos. Sin esta restricción una regla
  -- semanal podría guardar un día del mes que nadie lee, y la fila diría dos
  -- cosas distintas sobre cuándo publica.
  CONSTRAINT "publication_schedules_kind_fields_check"
    CHECK (
      CASE "kind"
        WHEN 'once' THEN
          "recurrence_interval" IS NULL
          AND "weekdays" = '{}'
          AND "month_day" IS NULL
          AND "month_day_overflow" IS NULL
        WHEN 'daily' THEN
          "recurrence_interval" IS NOT NULL
          AND "weekdays" = '{}'
          AND "month_day" IS NULL
          AND "month_day_overflow" IS NULL
        WHEN 'weekly' THEN
          "recurrence_interval" IS NOT NULL
          AND cardinality("weekdays") BETWEEN 1 AND 7
          AND "month_day" IS NULL
          AND "month_day_overflow" IS NULL
        WHEN 'monthly' THEN
          "recurrence_interval" IS NOT NULL
          AND "weekdays" = '{}'
          AND "month_day" BETWEEN 1 AND 31
          AND "month_day_overflow" IS NOT NULL
      END
    ),
  -- Un estado terminal sin su marca temporal no se puede auditar, y una marca
  -- sin su estado describe algo que no pasó.
  CONSTRAINT "publication_schedules_cancelled_check"
    CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL)),
  CONSTRAINT "publication_schedules_cancel_reason_check"
    CHECK (("cancelled_at" IS NULL) = ("cancelled_reason_code" IS NULL)),
  CONSTRAINT "publication_schedules_reason_format_check"
    CHECK ("cancelled_reason_code" IS NULL
           OR "cancelled_reason_code" ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  CONSTRAINT "publication_schedules_expired_check"
    CHECK (("status" = 'expired') = ("expired_at" IS NOT NULL)),
  CONSTRAINT "publication_schedules_completed_check"
    CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL)),
  CONSTRAINT "publication_schedules_paused_check"
    CHECK ("status" <> 'paused' OR "paused_at" IS NOT NULL),
  -- Sólo una programación única puede completarse: una recurrente termina
  -- venciendo o cancelada, nunca «terminada».
  CONSTRAINT "publication_schedules_completed_kind_check"
    CHECK ("status" <> 'completed' OR "kind" = 'once')
);

CREATE UNIQUE INDEX "publication_schedules_organization_id_key"
  ON "publication_schedules"("organization_id", "id");
CREATE INDEX "publication_schedules_org_status_from_idx"
  ON "publication_schedules"("organization_id", "status", "effective_from");
CREATE INDEX "publication_schedules_org_publication_idx"
  ON "publication_schedules"("organization_id", "publication_id", "created_at" DESC);

ALTER TABLE "publication_schedules"
  ADD CONSTRAINT "publication_schedules_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "publication_schedules_publication_id_fkey"
    FOREIGN KEY ("organization_id", "publication_id")
    REFERENCES "publications"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "publication_schedules_approval_snapshot_id_fkey"
    FOREIGN KEY ("organization_id", "approval_snapshot_id")
    REFERENCES "approval_snapshots"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "publication_schedules_created_by_membership_id_fkey"
    FOREIGN KEY ("organization_id", "created_by_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "publication_schedule_occurrences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "schedule_id" UUID NOT NULL,
  "occurrence_key" CHAR(16) NOT NULL,
  "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
  "resolution" "publication_occurrence_resolution" NOT NULL DEFAULT 'exact',
  "status" "publication_occurrence_status" NOT NULL DEFAULT 'planned',
  "publication_order_id" UUID,
  "skipped_reason_code" VARCHAR(40),
  "cancelled_at" TIMESTAMPTZ(3),
  "dispatched_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publication_schedule_occurrences_pkey" PRIMARY KEY ("id"),
  -- La clave civil local es la identidad: sin su forma exacta, dos claves que
  -- describen el mismo minuto podrían convivir y duplicar la publicación.
  CONSTRAINT "publication_occurrences_key_format_check"
    CHECK ("occurrence_key" ~
           '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Despachada y con orden son la misma cosa vista de dos lados; separarlas
  -- permitiría una ocurrencia «despachada» que nunca produjo nada.
  CONSTRAINT "publication_occurrences_dispatched_check"
    CHECK (("status" = 'dispatched')
           = ("publication_order_id" IS NOT NULL AND "dispatched_at" IS NOT NULL)),
  CONSTRAINT "publication_occurrences_cancelled_check"
    CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL)),
  CONSTRAINT "publication_occurrences_skipped_check"
    CHECK (("status" = 'skipped') = ("skipped_reason_code" IS NOT NULL)),
  CONSTRAINT "publication_occurrences_skip_format_check"
    CHECK ("skipped_reason_code" IS NULL
           OR "skipped_reason_code" ~ '^[a-z][a-z-]{0,39}$')
);

-- Identidad estable de la ocurrencia: volver a materializar la misma regla
-- encuentra esta fila en vez de crear otra.
CREATE UNIQUE INDEX "publication_occurrences_schedule_key"
  ON "publication_schedule_occurrences"("organization_id", "schedule_id", "occurrence_key");
-- Una orden pertenece a lo sumo a una ocurrencia: si dos la reclamaran, el
-- calendario diría que una publicación salió dos veces.
CREATE UNIQUE INDEX "publication_occurrences_order_key"
  ON "publication_schedule_occurrences"("organization_id", "publication_order_id")
  WHERE "publication_order_id" IS NOT NULL;
CREATE UNIQUE INDEX "publication_occurrences_organization_id_key"
  ON "publication_schedule_occurrences"("organization_id", "id");
-- El dispatcher busca lo que vence dentro de la organización.
CREATE INDEX "publication_occurrences_due_idx"
  ON "publication_schedule_occurrences"("organization_id", "status", "scheduled_at");

ALTER TABLE "publication_schedule_occurrences"
  ADD CONSTRAINT "publication_schedule_occurrences_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "publication_schedule_occurrences_schedule_id_fkey"
    FOREIGN KEY ("organization_id", "schedule_id")
    REFERENCES "publication_schedules"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "publication_schedule_occurrences_order_id_fkey"
    FOREIGN KEY ("organization_id", "publication_order_id")
    REFERENCES "publication_orders"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
