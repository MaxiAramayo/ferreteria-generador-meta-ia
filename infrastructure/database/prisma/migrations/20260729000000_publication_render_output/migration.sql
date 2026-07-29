ALTER TABLE "publication_revisions"
ADD COLUMN "rendered_media_asset_id" UUID,
ADD COLUMN "rendered_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "revisions_rendered_media_key"
ON "publication_revisions"("organization_id", "rendered_media_asset_id")
WHERE "rendered_media_asset_id" IS NOT NULL;

ALTER TABLE "publication_revisions"
ADD CONSTRAINT "publication_revisions_rendered_media_fkey"
FOREIGN KEY ("organization_id", "rendered_media_asset_id")
REFERENCES "media_assets"("organization_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "publication_revisions"
ADD CONSTRAINT "publication_revisions_rendered_pair_check"
CHECK (
  ("rendered_media_asset_id" IS NULL AND "rendered_at" IS NULL)
  OR
  ("rendered_media_asset_id" IS NOT NULL AND "rendered_at" IS NOT NULL)
);
