DROP TRIGGER IF EXISTS "organization_configuration_events_immutable"
    ON "organization_configuration_events";
DROP FUNCTION IF EXISTS "reject_configuration_event_mutation"();

DROP TABLE IF EXISTS "organization_configuration_events";
DROP TYPE IF EXISTS "configuration_target_type";

ALTER TABLE "locations"
    DROP CONSTRAINT IF EXISTS "locations_version_check",
    DROP COLUMN IF EXISTS "version";

ALTER TABLE "organizations"
    DROP CONSTRAINT IF EXISTS "organizations_version_check",
    DROP COLUMN IF EXISTS "version";
