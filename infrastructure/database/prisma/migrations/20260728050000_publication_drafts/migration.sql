CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "publication_revision_media"
    ADD COLUMN "alt" VARCHAR(240) NOT NULL DEFAULT 'Medio de publicación';

ALTER TABLE "publication_revision_media"
    ALTER COLUMN "alt" DROP DEFAULT;

UPDATE "publication_revisions"
SET "content_hash" = encode(
    digest("content"::text || "design_document"::text, 'sha256'),
    'hex'
)
WHERE "content_hash" IS NULL;

ALTER TABLE "publication_revisions"
    ALTER COLUMN "content_hash" SET NOT NULL;

CREATE FUNCTION "protect_publication_revision_history"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'publication revisions cannot be deleted'
            USING ERRCODE = '55000';
    END IF;

    IF OLD."organization_id" IS DISTINCT FROM NEW."organization_id"
        OR OLD."publication_id" IS DISTINCT FROM NEW."publication_id"
        OR OLD."created_by_membership_id" IS DISTINCT FROM NEW."created_by_membership_id"
        OR OLD."revision_number" IS DISTINCT FROM NEW."revision_number"
        OR OLD."schema_version" IS DISTINCT FROM NEW."schema_version"
        OR OLD."content" IS DISTINCT FROM NEW."content"
        OR OLD."design_document" IS DISTINCT FROM NEW."design_document"
        OR OLD."content_hash" IS DISTINCT FROM NEW."content_hash"
        OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
        RAISE EXCEPTION 'publication revision content is immutable'
            USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "publication_revisions_protect_history"
BEFORE UPDATE OR DELETE ON "publication_revisions"
FOR EACH ROW
EXECUTE FUNCTION "protect_publication_revision_history"();

CREATE FUNCTION "reject_revision_media_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'publication revision media is immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "publication_revision_media_immutable"
BEFORE UPDATE OR DELETE ON "publication_revision_media"
FOR EACH ROW
EXECUTE FUNCTION "reject_revision_media_mutation"();
