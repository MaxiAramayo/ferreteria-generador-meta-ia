CREATE TYPE "generation_attempt_status" AS ENUM (
  'reserved', 'in_flight', 'settled', 'unconfirmed', 'released'
);

CREATE TABLE "generation_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "organization_daily_attempt_limit" INTEGER NOT NULL DEFAULT 20,
  "user_daily_attempt_limit" INTEGER NOT NULL DEFAULT 8,
  "monthly_budget_microusd" INTEGER NOT NULL DEFAULT 20000000,
  "warning_threshold_percent" INTEGER NOT NULL DEFAULT 80,
  "time_zone" VARCHAR(40) NOT NULL DEFAULT 'UTC',
  "original_retention_days" INTEGER NOT NULL DEFAULT 90,
  "reference_retention_days" INTEGER NOT NULL DEFAULT 30,
  "generated_orphan_retention_hours" INTEGER NOT NULL DEFAULT 24,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generation_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generation_policies_organization_key" UNIQUE ("organization_id"),
  CONSTRAINT "generation_policies_timezone_check" CHECK ("time_zone" = 'UTC'),
  CONSTRAINT "generation_policies_limits_check" CHECK (
    "organization_daily_attempt_limit" BETWEEN 1 AND 10000
    AND "user_daily_attempt_limit" BETWEEN 1 AND 1000
    AND "monthly_budget_microusd" BETWEEN 100000 AND 1000000000
    AND "warning_threshold_percent" BETWEEN 1 AND 100
    AND "original_retention_days" BETWEEN 1 AND 3650
    AND "reference_retention_days" BETWEEN 1 AND 3650
    AND "generated_orphan_retention_hours" BETWEEN 1 AND 168
    AND "version" >= 1
  ),
  CONSTRAINT "generation_policies_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Las organizaciones existentes conservan la capacidad que ya tenían, pero
-- pasan a estar protegidas por los límites del piloto.
INSERT INTO "generation_policies" ("organization_id", "enabled")
SELECT "id", true FROM "organizations";

-- Toda organización nueva recibe una política administrable, inicialmente
-- deshabilitada. Fail-closed no significa ausente: un administrador tiene que
-- poder leerla y habilitarla mediante CAS sin intervención en la base.
CREATE FUNCTION "create_disabled_generation_policy"()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "generation_policies" ("organization_id", "enabled")
  VALUES (NEW."id", false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "organizations_create_disabled_generation_policy"
AFTER INSERT ON "organizations"
FOR EACH ROW EXECUTE FUNCTION "create_disabled_generation_policy"();

ALTER TABLE "generation_runs"
  ADD COLUMN "admission_mode" VARCHAR(20) NOT NULL DEFAULT 'provider',
  ADD COLUMN "admission_reason" VARCHAR(80),
  ADD COLUMN "pricing_version" VARCHAR(80) DEFAULT 'openai-gpt-image-2-standard-2026-08-05',
  ADD COLUMN "reference_cost_microusd" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reserved_cost_microusd" INTEGER NOT NULL DEFAULT 0;

UPDATE "generation_runs"
SET
  "admission_mode" = CASE WHEN "deterministic_reason" IS NULL THEN 'provider' ELSE 'deterministic' END,
  "admission_reason" = "deterministic_reason",
  "pricing_version" = CASE WHEN "deterministic_reason" IS NULL THEN 'legacy-unpriced' ELSE NULL END;

ALTER TABLE "generation_runs"
  ADD CONSTRAINT "generation_runs_admission_check" CHECK (
    ("admission_mode" = 'provider' AND "admission_reason" IS NULL AND "pricing_version" IS NOT NULL)
    OR
    ("admission_mode" = 'deterministic' AND "admission_reason" IS NOT NULL AND "pricing_version" IS NULL
      AND "reference_cost_microusd" = 0 AND "reserved_cost_microusd" = 0)
  );

CREATE TABLE "generation_attempts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" "generation_attempt_status" NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "quality" VARCHAR(20) NOT NULL,
  "size" VARCHAR(30) NOT NULL,
  "pricing_version" VARCHAR(80) NOT NULL,
  "reserved_microusd" INTEGER NOT NULL,
  "settled_microusd" INTEGER NOT NULL DEFAULT 0,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "text_input_tokens" INTEGER NOT NULL DEFAULT 0,
  "image_input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "request_id" VARCHAR(120),
  "reserved_at" TIMESTAMPTZ(3) NOT NULL,
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generation_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generation_attempts_variant_number_key" UNIQUE ("organization_id", "variant_id", "attempt_number"),
  CONSTRAINT "generation_attempts_values_check" CHECK (
    "attempt_number" >= 1 AND "reserved_microusd" >= 0 AND "settled_microusd" >= 0
    AND "input_tokens" >= 0 AND "text_input_tokens" >= 0
    AND "image_input_tokens" >= 0 AND "output_tokens" >= 0 AND "total_tokens" >= 0
  ),
  CONSTRAINT "generation_attempts_state_check" CHECK (
    ("status" = 'reserved' AND "started_at" IS NULL AND "completed_at" IS NULL)
    OR ("status" = 'in_flight' AND "started_at" IS NOT NULL AND "completed_at" IS NULL)
    OR ("status" IN ('settled', 'unconfirmed') AND "started_at" IS NOT NULL AND "completed_at" IS NOT NULL)
    OR ("status" = 'released' AND "started_at" IS NULL AND "completed_at" IS NOT NULL)
  ),
  CONSTRAINT "generation_attempts_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "generation_attempts_actor_fkey"
    FOREIGN KEY ("organization_id", "actor_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "generation_attempts_run_fkey"
    FOREIGN KEY ("organization_id", "run_id")
    REFERENCES "generation_runs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "generation_attempts_variant_fkey"
    FOREIGN KEY ("organization_id", "variant_id")
    REFERENCES "generation_run_variants"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "generation_attempts_org_day_idx"
  ON "generation_attempts" ("organization_id", "reserved_at", "status");
CREATE INDEX "generation_attempts_actor_day_idx"
  ON "generation_attempts" ("organization_id", "actor_membership_id", "reserved_at", "status");
CREATE INDEX "generation_attempts_run_status_idx"
  ON "generation_attempts" ("organization_id", "run_id", "status");

CREATE TABLE "generation_budget_alerts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "month_utc" CHAR(7) NOT NULL,
  "threshold_percent" INTEGER NOT NULL,
  "committed_microusd" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generation_budget_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generation_budget_alerts_organization_month_key"
    UNIQUE ("organization_id", "month_utc"),
  CONSTRAINT "generation_budget_alerts_values_check"
    CHECK ("threshold_percent" BETWEEN 1 AND 100 AND "committed_microusd" >= 0),
  CONSTRAINT "generation_budget_alerts_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE FUNCTION "require_available_rendered_media"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE "current_status" "media_asset_status";
BEGIN
  IF NEW."rendered_media_asset_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "status" INTO "current_status" FROM "media_assets"
  WHERE "organization_id" = NEW."organization_id" AND "id" = NEW."rendered_media_asset_id"
  FOR SHARE;
  IF "current_status" IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'rendered revisions require available media' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "publication_revisions_rendered_media_requires_available"
BEFORE INSERT OR UPDATE OF "organization_id", "rendered_media_asset_id"
ON "publication_revisions" FOR EACH ROW
EXECUTE FUNCTION "require_available_rendered_media"();

CREATE FUNCTION "require_available_generation_media"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE "current_status" "media_asset_status";
BEGIN
  IF NEW."media_asset_id" IS NOT NULL THEN
    SELECT "status" INTO "current_status" FROM "media_assets"
    WHERE "organization_id" = NEW."organization_id" AND "id" = NEW."media_asset_id" FOR SHARE;
    IF "current_status" IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'generation variants require available base media' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."composed_media_asset_id" IS NOT NULL THEN
    SELECT "status" INTO "current_status" FROM "media_assets"
    WHERE "organization_id" = NEW."organization_id" AND "id" = NEW."composed_media_asset_id" FOR SHARE;
    IF "current_status" IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'generation variants require available composed media' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "generation_run_variants_media_requires_available"
BEFORE INSERT OR UPDATE OF "organization_id", "media_asset_id", "composed_media_asset_id"
ON "generation_run_variants" FOR EACH ROW
EXECUTE FUNCTION "require_available_generation_media"();
