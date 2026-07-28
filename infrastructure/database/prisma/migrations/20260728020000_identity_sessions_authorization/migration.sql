CREATE TYPE "authentication_event_type" AS ENUM (
    'login_succeeded',
    'login_failed',
    'login_rate_limited',
    'session_revoked',
    'sessions_revoked',
    'membership_roles_changed',
    'membership_revoked'
);

ALTER TABLE "users"
    ADD COLUMN "password_changed_at" TIMESTAMPTZ(3),
    ADD COLUMN "password_hash" TEXT,
    ADD COLUMN "password_hash_version" INTEGER,
    ADD CONSTRAINT "users_password_credential_check" CHECK (
        (
            "password_hash" IS NULL
            AND "password_hash_version" IS NULL
            AND "password_changed_at" IS NULL
        )
        OR (
            length("password_hash") BETWEEN 40 AND 512
            AND "password_hash_version" > 0
            AND "password_changed_at" IS NOT NULL
        )
    );

CREATE UNIQUE INDEX "memberships_organization_user_id_key"
    ON "organization_memberships"("organization_id", "user_id", "id");

CREATE TABLE "authentication_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_token_hash" CHAR(64) NOT NULL,
    "client_fingerprint_hash" CHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "authentication_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "authentication_sessions_token_hash_check" CHECK (
        "token_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "authentication_sessions_csrf_hash_check" CHECK (
        "csrf_token_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "authentication_sessions_fingerprint_hash_check" CHECK (
        "client_fingerprint_hash" IS NULL
        OR "client_fingerprint_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "authentication_sessions_lifetime_check" CHECK (
        "expires_at" > "created_at"
        AND "last_seen_at" >= "created_at"
        AND "updated_at" >= "created_at"
    ),
    CONSTRAINT "authentication_sessions_revocation_check" CHECK (
        ("revoked_at" IS NULL AND "revoke_reason" IS NULL)
        OR (
            "revoked_at" IS NOT NULL
            AND "revoke_reason" IS NOT NULL
            AND "revoked_at" >= "created_at"
        )
    )
);

CREATE TABLE "authentication_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "user_id" UUID,
    "actor_membership_id" UUID,
    "target_membership_id" UUID,
    "event_type" "authentication_event_type" NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "subject_hash" CHAR(64),
    "client_fingerprint_hash" CHAR(64),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "authentication_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "authentication_events_subject_hash_check" CHECK (
        "subject_hash" IS NULL OR "subject_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "authentication_events_fingerprint_hash_check" CHECK (
        "client_fingerprint_hash" IS NULL
        OR "client_fingerprint_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "authentication_events_membership_scope_check" CHECK (
        (
            "actor_membership_id" IS NULL
            AND "target_membership_id" IS NULL
        )
        OR "organization_id" IS NOT NULL
    ),
    CONSTRAINT "authentication_events_timestamps_check" CHECK (
        "occurred_at" <= "created_at" + INTERVAL '5 minutes'
        AND "updated_at" = "created_at"
    )
);

CREATE UNIQUE INDEX "authentication_sessions_token_hash_key"
    ON "authentication_sessions"("token_hash");
CREATE INDEX "authentication_sessions_user_active_idx"
    ON "authentication_sessions"("user_id", "revoked_at", "expires_at");
CREATE INDEX "authentication_sessions_membership_active_idx"
    ON "authentication_sessions"(
        "organization_id",
        "membership_id",
        "revoked_at"
    );
CREATE INDEX "authentication_sessions_expiry_idx"
    ON "authentication_sessions"("expires_at");
CREATE INDEX "authentication_events_login_limit_idx"
    ON "authentication_events"(
        "subject_hash",
        "client_fingerprint_hash",
        "event_type",
        "occurred_at" DESC
    );
CREATE INDEX "authentication_events_org_occurred_idx"
    ON "authentication_events"("organization_id", "occurred_at" DESC);

ALTER TABLE "authentication_sessions"
    ADD CONSTRAINT "authentication_sessions_membership_fkey"
    FOREIGN KEY ("organization_id", "user_id", "membership_id")
    REFERENCES "organization_memberships"("organization_id", "user_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "authentication_sessions"
    ADD CONSTRAINT "authentication_sessions_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "authentication_sessions"
    ADD CONSTRAINT "authentication_sessions_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "authentication_events"
    ADD CONSTRAINT "authentication_events_actor_fkey"
    FOREIGN KEY ("organization_id", "actor_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "authentication_events"
    ADD CONSTRAINT "authentication_events_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "authentication_events"
    ADD CONSTRAINT "authentication_events_target_fkey"
    FOREIGN KEY ("organization_id", "target_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "authentication_events"
    ADD CONSTRAINT "authentication_events_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_authentication_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'authentication events are immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "authentication_events_immutable"
BEFORE UPDATE OR DELETE ON "authentication_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_authentication_event_mutation"();
