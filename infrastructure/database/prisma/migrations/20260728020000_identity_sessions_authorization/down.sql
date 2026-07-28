DROP TRIGGER IF EXISTS "authentication_events_immutable"
    ON "authentication_events";
DROP FUNCTION IF EXISTS "reject_authentication_event_mutation"();

DROP TABLE IF EXISTS "authentication_events";
DROP TABLE IF EXISTS "authentication_sessions";

DROP INDEX IF EXISTS "memberships_organization_user_id_key";

ALTER TABLE "users"
    DROP CONSTRAINT IF EXISTS "users_password_credential_check",
    DROP COLUMN IF EXISTS "password_changed_at",
    DROP COLUMN IF EXISTS "password_hash",
    DROP COLUMN IF EXISTS "password_hash_version";

DROP TYPE IF EXISTS "authentication_event_type";
