DROP TRIGGER IF EXISTS "publication_revision_media_requires_available"
    ON "publication_revision_media";
DROP FUNCTION IF EXISTS "require_available_revision_media"();

DROP INDEX IF EXISTS "media_assets_status_retention_idx";

ALTER TABLE "media_assets"
    DROP CONSTRAINT IF EXISTS "media_assets_available_dimensions_check",
    DROP CONSTRAINT IF EXISTS "media_assets_deleted_status_check",
    DROP CONSTRAINT IF EXISTS "media_assets_failure_status_check",
    DROP CONSTRAINT IF EXISTS "media_assets_failure_pair_check",
    DROP COLUMN IF EXISTS "deleted_at",
    DROP COLUMN IF EXISTS "failure_message",
    DROP COLUMN IF EXISTS "failure_code";
