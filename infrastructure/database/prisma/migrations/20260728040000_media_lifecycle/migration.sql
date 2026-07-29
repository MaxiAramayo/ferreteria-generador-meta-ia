ALTER TABLE "media_assets"
    ADD COLUMN "failure_code" VARCHAR(80),
    ADD COLUMN "failure_message" VARCHAR(300),
    ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

UPDATE "media_assets"
SET "deleted_at" = "updated_at"
WHERE "status" = 'deleted'
  AND "deleted_at" IS NULL;

ALTER TABLE "media_assets"
    ADD CONSTRAINT "media_assets_failure_pair_check" CHECK (
        ("failure_code" IS NULL) = ("failure_message" IS NULL)
    ),
    ADD CONSTRAINT "media_assets_failure_status_check" CHECK (
        "status" = 'failed'
        OR ("failure_code" IS NULL AND "failure_message" IS NULL)
    ),
    ADD CONSTRAINT "media_assets_deleted_status_check" CHECK (
        ("status" = 'deleted') = ("deleted_at" IS NOT NULL)
    ),
    ADD CONSTRAINT "media_assets_available_dimensions_check" CHECK (
        "status" <> 'available'
        OR ("width" IS NOT NULL AND "height" IS NOT NULL)
    );

CREATE INDEX "media_assets_status_retention_idx"
    ON "media_assets"("status", "retention_until");

CREATE FUNCTION "require_available_revision_media"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    "current_status" "media_asset_status";
BEGIN
    SELECT "status"
    INTO "current_status"
    FROM "media_assets"
    WHERE "organization_id" = NEW."organization_id"
      AND "id" = NEW."media_asset_id"
    FOR SHARE;

    IF "current_status" IS DISTINCT FROM 'available' THEN
        RAISE EXCEPTION 'publication revisions require available media'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "publication_revision_media_requires_available"
BEFORE INSERT OR UPDATE OF "organization_id", "media_asset_id"
ON "publication_revision_media"
FOR EACH ROW
EXECUTE FUNCTION "require_available_revision_media"();
