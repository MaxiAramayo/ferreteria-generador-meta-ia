ALTER TABLE "publication_revisions"
DROP CONSTRAINT IF EXISTS "publication_revisions_rendered_pair_check";

ALTER TABLE "publication_revisions"
DROP CONSTRAINT IF EXISTS "publication_revisions_rendered_media_fkey";

DROP INDEX IF EXISTS "revisions_rendered_media_key";

ALTER TABLE "publication_revisions"
DROP COLUMN IF EXISTS "rendered_at",
DROP COLUMN IF EXISTS "rendered_media_asset_id";
