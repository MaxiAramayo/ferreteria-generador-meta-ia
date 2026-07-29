CREATE TYPE "idempotency_status" AS ENUM ('processing', 'completed');
CREATE TYPE "outbox_message_status" AS ENUM (
    'pending',
    'processing',
    'delivered',
    'dead_letter'
);

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_membership_id" UUID,
    "operation" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(120) NOT NULL,
    "entity_id" VARCHAR(160),
    "outcome" VARCHAR(20) NOT NULL,
    "metadata" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_events_outcome_check"
        CHECK ("outcome" IN ('success', 'failure')),
    CONSTRAINT "audit_events_metadata_object_check"
        CHECK (jsonb_typeof("metadata") = 'object'),
    CONSTRAINT "audit_events_actor_scope_fkey"
        FOREIGN KEY ("organization_id", "actor_membership_id")
        REFERENCES "organization_memberships"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "audit_events_organization_id_fkey"
        FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "operation" VARCHAR(120) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" "idempotency_status" NOT NULL DEFAULT 'processing',
    "response_status" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idempotency_key_hash_check"
        CHECK ("key_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "idempotency_request_hash_check"
        CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "idempotency_expiry_check"
        CHECK ("expires_at" > "created_at"),
    CONSTRAINT "idempotency_response_check" CHECK (
        (
            "status" = 'processing'
            AND "response_status" IS NULL
            AND "response_body" IS NULL
            AND "completed_at" IS NULL
        )
        OR (
            "status" = 'completed'
            AND "response_status" BETWEEN 100 AND 599
            AND jsonb_typeof("response_body") = 'object'
            AND "completed_at" IS NOT NULL
        )
    ),
    CONSTRAINT "idempotency_actor_scope_fkey"
        FOREIGN KEY ("organization_id", "actor_membership_id")
        REFERENCES "organization_memberships"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "idempotency_organization_id_fkey"
        FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "topic" VARCHAR(160) NOT NULL,
    "aggregate_type" VARCHAR(120) NOT NULL,
    "aggregate_id" VARCHAR(160) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_message_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL,
    "locked_at" TIMESTAMPTZ(3),
    "lease_expires_at" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(120),
    "delivered_at" TIMESTAMPTZ(3),
    "last_error_code" VARCHAR(80),
    "last_error_message" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_payload_object_check"
        CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "outbox_attempts_check"
        CHECK ("attempts" BETWEEN 0 AND 12),
    CONSTRAINT "outbox_state_check" CHECK (
        (
            "status" = 'pending'
            AND "locked_at" IS NULL
            AND "lease_expires_at" IS NULL
            AND "locked_by" IS NULL
            AND "delivered_at" IS NULL
        )
        OR (
            "status" = 'processing'
            AND "locked_at" IS NOT NULL
            AND "lease_expires_at" > "locked_at"
            AND "locked_by" IS NOT NULL
            AND "delivered_at" IS NULL
        )
        OR (
            "status" = 'delivered'
            AND "locked_at" IS NULL
            AND "lease_expires_at" IS NULL
            AND "locked_by" IS NULL
            AND "delivered_at" IS NOT NULL
        )
        OR (
            "status" = 'dead_letter'
            AND "locked_at" IS NULL
            AND "lease_expires_at" IS NULL
            AND "locked_by" IS NULL
            AND "delivered_at" IS NULL
            AND "last_error_code" IS NOT NULL
            AND "last_error_message" IS NOT NULL
        )
    ),
    CONSTRAINT "outbox_messages_organization_id_fkey"
        FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "idempotency_scope_key"
    ON "idempotency_records"(
        "organization_id",
        "actor_membership_id",
        "operation",
        "key_hash"
    );
CREATE INDEX "idempotency_expiry_idx"
    ON "idempotency_records"("expires_at", "status");
CREATE INDEX "audit_events_org_occurred_idx"
    ON "audit_events"("organization_id", "occurred_at" DESC, "id");
CREATE INDEX "audit_events_entity_idx"
    ON "audit_events"(
        "organization_id",
        "entity_type",
        "entity_id",
        "occurred_at" DESC
    );
CREATE INDEX "outbox_claim_idx"
    ON "outbox_messages"(
        "status",
        "available_at",
        "lease_expires_at",
        "created_at",
        "id"
    );
CREATE INDEX "outbox_aggregate_idx"
    ON "outbox_messages"(
        "organization_id",
        "aggregate_type",
        "aggregate_id",
        "created_at" DESC
    );
CREATE INDEX "outbox_retention_idx"
    ON "outbox_messages"("status", "delivered_at");

CREATE FUNCTION "reject_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit events are append-only'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_audit_event_mutation"();
