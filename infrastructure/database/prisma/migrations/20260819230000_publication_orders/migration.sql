CREATE TYPE "publication_target_kind" AS ENUM (
  'instagram_feed',
  'instagram_story',
  'facebook_page'
);

CREATE TYPE "publication_attempt_state" AS ENUM (
  'pending',
  'media_staged',
  'published',
  'published_unconfirmed',
  'outcome_unknown',
  'failed'
);

CREATE TABLE "publication_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "publication_id" UUID NOT NULL,
  "approval_snapshot_id" UUID NOT NULL,
  "requested_by_membership_id" UUID NOT NULL,
  "cancelled_at" TIMESTAMPTZ(3),
  "cancelled_reason_code" VARCHAR(80),
  "settled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publication_orders_pkey" PRIMARY KEY ("id"),
  -- Una cancelación sin motivo no se puede auditar después.
  CONSTRAINT "publication_orders_cancelled_check"
    CHECK (("cancelled_at" IS NULL) = ("cancelled_reason_code" IS NULL)),
  CONSTRAINT "publication_orders_reason_format_check"
    CHECK ("cancelled_reason_code" IS NULL
           OR "cancelled_reason_code" ~ '^[a-z0-9][a-z0-9._-]{0,79}$')
);

CREATE UNIQUE INDEX "publication_orders_organization_id_key"
  ON "publication_orders"("organization_id", "id");
CREATE INDEX "publication_orders_org_publication_idx"
  ON "publication_orders"("organization_id", "publication_id", "created_at" DESC);
CREATE INDEX "publication_orders_org_settled_idx"
  ON "publication_orders"("organization_id", "settled_at");

ALTER TABLE "publication_orders"
  ADD CONSTRAINT "publication_orders_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "publication_orders_publication_id_fkey"
    FOREIGN KEY ("organization_id", "publication_id")
    REFERENCES "publications"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "publication_orders_approval_snapshot_id_fkey"
    FOREIGN KEY ("organization_id", "approval_snapshot_id")
    REFERENCES "approval_snapshots"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "publication_orders_requested_by_membership_id_fkey"
    FOREIGN KEY ("organization_id", "requested_by_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "publication_order_targets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "target" "publication_target_kind" NOT NULL,
  "attempt_id" VARCHAR(120),
  "state" "publication_attempt_state" NOT NULL DEFAULT 'pending',
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "staged_media_id" VARCHAR(160),
  "remote_post_id" VARCHAR(200),
  "remote_permalink" VARCHAR(500),
  "failure_code" VARCHAR(80),
  "failure_detail" VARCHAR(300),
  "failure_retryable" BOOLEAN,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publication_order_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publication_order_targets_sequence_check" CHECK ("sequence" >= 0),
  -- Un destino publicado sin identificador remoto sería un éxito que nadie
  -- puede consultar; para eso existe `published_unconfirmed`.
  CONSTRAINT "publication_order_targets_published_check"
    CHECK ("state" <> 'published' OR "remote_post_id" IS NOT NULL),
  -- Un fallo sin código no se puede clasificar ni reintentar con criterio.
  CONSTRAINT "publication_order_targets_failure_check"
    CHECK ("state" <> 'failed' OR "failure_code" IS NOT NULL)
);

CREATE UNIQUE INDEX "publication_order_targets_order_target_key"
  ON "publication_order_targets"("organization_id", "order_id", "target");
CREATE UNIQUE INDEX "publication_order_targets_organization_id_key"
  ON "publication_order_targets"("organization_id", "id");
CREATE INDEX "publication_order_targets_order_state_idx"
  ON "publication_order_targets"("organization_id", "order_id", "state");

ALTER TABLE "publication_order_targets"
  ADD CONSTRAINT "publication_order_targets_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "publication_order_targets_order_id_fkey"
    FOREIGN KEY ("organization_id", "order_id")
    REFERENCES "publication_orders"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
