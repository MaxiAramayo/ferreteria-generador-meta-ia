CREATE TYPE "content_brief_run_status" AS ENUM (
  'generated',
  'rejected'
);

CREATE TABLE "content_brief_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "location_id" UUID,
  "status" "content_brief_run_status" NOT NULL,
  "request" VARCHAR(600) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "requested_at" TIMESTAMPTZ(3) NOT NULL,
  "prompt_version" VARCHAR(80) NOT NULL,
  "prompt_hash" CHAR(64) NOT NULL,
  "schema_version" VARCHAR(80) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "knowledge_status" VARCHAR(120) NOT NULL,
  "tool_names" JSONB NOT NULL,
  "tool_invocations" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "brief" JSONB,
  "rejection_code" VARCHAR(80),
  "rejection_message" VARCHAR(300),
  "response_id" VARCHAR(120),
  "request_id" VARCHAR(120),
  "attempts" INTEGER NOT NULL,
  "latency_milliseconds" INTEGER NOT NULL,
  "input_tokens" INTEGER NOT NULL,
  "cached_input_tokens" INTEGER NOT NULL,
  "output_tokens" INTEGER NOT NULL,
  "reasoning_tokens" INTEGER NOT NULL,
  "total_tokens" INTEGER NOT NULL,
  "estimated_cost_usd" NUMERIC(12, 6),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "content_brief_runs_pkey" PRIMARY KEY ("id"),
  -- Un run generado conserva su brief y no lleva rechazo; uno rechazado conserva
  -- el motivo y no puede exponer un brief. La base impide el estado híbrido.
  CONSTRAINT "content_brief_runs_outcome_check" CHECK (
    ("status" = 'generated' AND "brief" IS NOT NULL AND "rejection_code" IS NULL)
    OR
    ("status" = 'rejected' AND "brief" IS NULL AND "rejection_code" IS NOT NULL)
  )
);

ALTER TABLE "content_brief_runs"
  ADD CONSTRAINT "content_brief_runs_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_brief_runs"
  ADD CONSTRAINT "content_brief_runs_actor_fkey"
  FOREIGN KEY ("organization_id", "actor_membership_id")
  REFERENCES "organization_memberships"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_brief_runs"
  ADD CONSTRAINT "content_brief_runs_location_fkey"
  FOREIGN KEY ("organization_id", "location_id")
  REFERENCES "locations"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "content_brief_runs_org_created_idx"
  ON "content_brief_runs" ("organization_id", "created_at" DESC, "id");

CREATE INDEX "content_brief_runs_org_actor_idx"
  ON "content_brief_runs" ("organization_id", "actor_membership_id", "created_at" DESC);

CREATE INDEX "content_brief_runs_prompt_idx"
  ON "content_brief_runs" ("organization_id", "prompt_version", "model", "created_at" DESC);
