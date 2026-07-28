CREATE TYPE "publication_transition_command_type" AS ENUM (
    'advance',
    'approve',
    'cancel',
    'edit_approved',
    'expire',
    'fail'
);

ALTER TABLE "publications"
    ADD COLUMN "failure_code" VARCHAR(80),
    ADD COLUMN "failure_message" VARCHAR(300),
    ADD COLUMN "failure_retryable" BOOLEAN,
    ADD COLUMN "failure_occurred_at" TIMESTAMPTZ(3),
    ADD CONSTRAINT "publications_failure_complete_check" CHECK (
        (
            "failure_code" IS NULL
            AND "failure_message" IS NULL
            AND "failure_retryable" IS NULL
            AND "failure_occurred_at" IS NULL
        )
        OR (
            "failure_code" IS NOT NULL
            AND "failure_message" IS NOT NULL
            AND "failure_retryable" IS NOT NULL
            AND "failure_occurred_at" IS NOT NULL
        )
    ),
    ADD CONSTRAINT "publications_failure_code_check" CHECK (
        "failure_code" IS NULL OR "failure_code" ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
    );

CREATE TABLE "publication_state_transitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "command_type" "publication_transition_command_type" NOT NULL,
    "from_status" "publication_status" NOT NULL,
    "to_status" "publication_status" NOT NULL,
    "from_version" INTEGER NOT NULL,
    "to_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "reason_code" VARCHAR(80),
    "failure_code" VARCHAR(80),
    "failure_message" VARCHAR(300),
    "failure_retryable" BOOLEAN,
    "new_revision_id" UUID,
    "approval_snapshot_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "publication_state_transitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "state_transitions_version_check" CHECK (
        "from_version" > 0 AND "to_version" = "from_version" + 1
    ),
    CONSTRAINT "state_transitions_status_check" CHECK ("from_status" <> "to_status"),
    CONSTRAINT "state_transitions_reason_code_check" CHECK (
        "reason_code" IS NULL OR "reason_code" ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
    ),
    CONSTRAINT "state_transitions_failure_complete_check" CHECK (
        (
            "failure_code" IS NULL
            AND "failure_message" IS NULL
            AND "failure_retryable" IS NULL
        )
        OR (
            "failure_code" IS NOT NULL
            AND "failure_message" IS NOT NULL
            AND "failure_retryable" IS NOT NULL
        )
    ),
    CONSTRAINT "state_transitions_failure_code_check" CHECK (
        "failure_code" IS NULL OR "failure_code" ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
    ),
    CONSTRAINT "state_transitions_approval_check" CHECK (
        ("command_type" = 'approve' AND "approval_snapshot_id" IS NOT NULL)
        OR ("command_type" <> 'approve' AND "approval_snapshot_id" IS NULL)
    ),
    CONSTRAINT "state_transitions_edit_check" CHECK (
        ("command_type" = 'edit_approved' AND "new_revision_id" IS NOT NULL)
        OR ("command_type" <> 'edit_approved' AND "new_revision_id" IS NULL)
    ),
    CONSTRAINT "state_transitions_timestamps_check" CHECK (
        "updated_at" = "created_at" AND "occurred_at" <= "created_at"
    )
);

CREATE UNIQUE INDEX "state_transitions_publication_version_key"
    ON "publication_state_transitions"("organization_id", "publication_id", "to_version");
CREATE INDEX "state_transitions_org_publication_time_idx"
    ON "publication_state_transitions"("organization_id", "publication_id", "occurred_at" DESC);

ALTER TABLE "publication_state_transitions"
    ADD CONSTRAINT "publication_state_transitions_organization_id_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_state_transitions"
    ADD CONSTRAINT "publication_state_transitions_organization_publication_fkey"
    FOREIGN KEY ("organization_id", "publication_id")
    REFERENCES "publications"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_state_transitions"
    ADD CONSTRAINT "publication_state_transitions_organization_actor_fkey"
    FOREIGN KEY ("organization_id", "actor_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_state_transitions"
    ADD CONSTRAINT "publication_state_transitions_organization_approval_fkey"
    FOREIGN KEY ("organization_id", "approval_snapshot_id")
    REFERENCES "approval_snapshots"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_state_transitions"
    ADD CONSTRAINT "publication_state_transitions_organization_revision_fkey"
    FOREIGN KEY ("organization_id", "new_revision_id")
    REFERENCES "publication_revisions"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_publication_state_transition_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'publication state transitions are immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "publication_state_transitions_immutable"
BEFORE UPDATE OR DELETE ON "publication_state_transitions"
FOR EACH ROW
EXECUTE FUNCTION "reject_publication_state_transition_mutation"();
