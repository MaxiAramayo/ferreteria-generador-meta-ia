CREATE TYPE "recurring_story_approval_policy" AS ENUM ('human_each_cycle', 'automatic_routine');
CREATE TYPE "recurring_story_rule_status" AS ENUM ('active', 'paused', 'cancelled');
CREATE TYPE "location_day_status" AS ENUM ('open', 'closed');
CREATE TYPE "recurring_story_materialization_status" AS ENUM (
  'draft_created',
  'blocked_location_closed',
  'blocked_location_inactive',
  'blocked_missing_hours',
  'invalidated',
  'approved_scheduled'
);

CREATE TABLE "location_day_overrides" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "local_date" DATE NOT NULL,
  "status" "location_day_status" NOT NULL,
  "opening_hours" VARCHAR(180),
  "source_label" VARCHAR(180) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "location_day_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "location_day_overrides_hours_check" CHECK (
    ("status" = 'closed' AND "opening_hours" IS NULL)
    OR ("status" = 'open' AND length(trim("opening_hours")) > 0)
  ),
  CONSTRAINT "location_day_overrides_version_check" CHECK ("version" > 0),
  CONSTRAINT "location_day_overrides_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "location_day_overrides_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "location_day_overrides_location_date_key" ON "location_day_overrides"("organization_id", "location_id", "local_date");
CREATE UNIQUE INDEX "location_day_overrides_organization_id_key" ON "location_day_overrides"("organization_id", "id");
CREATE INDEX "location_day_overrides_org_date_idx" ON "location_day_overrides"("organization_id", "local_date");

CREATE TABLE "recurring_story_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "created_by_membership_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "local_time" CHAR(5) NOT NULL,
  "time_zone" VARCHAR(80) NOT NULL,
  "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "lead_time_minutes" INTEGER NOT NULL,
  "effective_from" TIMESTAMPTZ(3) NOT NULL,
  "approval_policy" "recurring_story_approval_policy" NOT NULL,
  "status" "recurring_story_rule_status" NOT NULL DEFAULT 'active',
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recurring_story_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recurring_story_rules_time_check" CHECK ("local_time" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "recurring_story_rules_weekdays_check" CHECK (cardinality("weekdays") > 0 AND "weekdays" <@ ARRAY[1,2,3,4,5,6,7]),
  CONSTRAINT "recurring_story_rules_lead_check" CHECK ("lead_time_minutes" BETWEEN 15 AND 10080),
  CONSTRAINT "recurring_story_rules_version_check" CHECK ("version" > 0),
  CONSTRAINT "recurring_story_rules_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recurring_story_rules_actor_fkey" FOREIGN KEY ("organization_id", "created_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recurring_story_rules_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "recurring_story_rules_organization_id_key" ON "recurring_story_rules"("organization_id", "id");
CREATE UNIQUE INDEX "recurring_story_rules_idempotency_key" ON "recurring_story_rules"("organization_id", "idempotency_key");
CREATE INDEX "recurring_story_rules_due_idx" ON "recurring_story_rules"("status", "effective_from", "id");
CREATE INDEX "recurring_story_rules_org_status_idx" ON "recurring_story_rules"("organization_id", "status", "created_at" DESC);

CREATE TABLE "recurring_story_materializations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "publication_id" UUID,
  "schedule_id" UUID,
  "occurrence_key" CHAR(16) NOT NULL,
  "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
  "resolution" "publication_occurrence_resolution" NOT NULL DEFAULT 'exact',
  "location_version" INTEGER NOT NULL,
  "source_snapshot" JSONB NOT NULL,
  "requires_human_approval" BOOLEAN NOT NULL,
  "status" "recurring_story_materialization_status" NOT NULL,
  "blocked_reason_code" VARCHAR(80),
  "invalidated_at" TIMESTAMPTZ(3),
  "invalidated_reason_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recurring_story_materializations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recurring_story_materializations_publication_check" CHECK (
    ("status" IN ('draft_created', 'approved_scheduled', 'invalidated') AND "publication_id" IS NOT NULL)
    OR ("status" IN ('blocked_location_closed', 'blocked_location_inactive', 'blocked_missing_hours') AND "publication_id" IS NULL)
  ),
  CONSTRAINT "recurring_story_materializations_schedule_check" CHECK (("status" = 'approved_scheduled') = ("schedule_id" IS NOT NULL)),
  CONSTRAINT "recurring_story_materializations_invalidation_check" CHECK (("status" = 'invalidated') = ("invalidated_at" IS NOT NULL AND "invalidated_reason_code" IS NOT NULL)),
  CONSTRAINT "recurring_story_materializations_rule_fkey" FOREIGN KEY ("organization_id", "rule_id") REFERENCES "recurring_story_rules"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recurring_story_materializations_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recurring_story_materializations_publication_fkey" FOREIGN KEY ("organization_id", "publication_id") REFERENCES "publications"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recurring_story_materializations_schedule_fkey" FOREIGN KEY ("organization_id", "schedule_id") REFERENCES "publication_schedules"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recurring_story_materializations_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "recurring_story_materializations_rule_key" ON "recurring_story_materializations"("organization_id", "rule_id", "occurrence_key");
CREATE UNIQUE INDEX "recurring_story_materializations_publication_key" ON "recurring_story_materializations"("organization_id", "publication_id");
CREATE UNIQUE INDEX "recurring_story_materializations_schedule_key" ON "recurring_story_materializations"("organization_id", "schedule_id");
CREATE INDEX "recurring_story_materializations_location_status_idx" ON "recurring_story_materializations"("organization_id", "location_id", "status");
