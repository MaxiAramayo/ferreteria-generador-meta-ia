CREATE TYPE "configuration_target_type" AS ENUM (
    'organization',
    'brand',
    'location'
);

ALTER TABLE "organizations"
    ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "organizations_version_check" CHECK ("version" > 0);

ALTER TABLE "locations"
    ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "locations_version_check" CHECK ("version" > 0);

CREATE TABLE "organization_configuration_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "target_type" "configuration_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_configuration_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "configuration_events_timestamps_check" CHECK (
        "occurred_at" <= "created_at" + INTERVAL '5 minutes'
        AND "updated_at" = "created_at"
    )
);

CREATE INDEX "configuration_events_org_occurred_idx"
    ON "organization_configuration_events"(
        "organization_id",
        "occurred_at" DESC
    );
CREATE INDEX "configuration_events_target_idx"
    ON "organization_configuration_events"(
        "organization_id",
        "target_type",
        "target_id",
        "occurred_at" DESC
    );

ALTER TABLE "organization_configuration_events"
    ADD CONSTRAINT "configuration_events_actor_fkey"
    FOREIGN KEY ("organization_id", "actor_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_configuration_events"
    ADD CONSTRAINT "configuration_events_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_configuration_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'organization configuration events are immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "organization_configuration_events_immutable"
BEFORE UPDATE OR DELETE ON "organization_configuration_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_configuration_event_mutation"();
