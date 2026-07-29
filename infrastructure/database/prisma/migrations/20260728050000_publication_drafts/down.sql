DROP TRIGGER IF EXISTS "publication_revision_media_immutable"
    ON "publication_revision_media";
DROP FUNCTION IF EXISTS "reject_revision_media_mutation"();

DROP TRIGGER IF EXISTS "publication_revisions_protect_history"
    ON "publication_revisions";
DROP FUNCTION IF EXISTS "protect_publication_revision_history"();

ALTER TABLE "publication_revisions"
    ALTER COLUMN "content_hash" DROP NOT NULL;

ALTER TABLE "publication_revision_media"
    DROP COLUMN IF EXISTS "alt";
