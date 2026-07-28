DROP TRIGGER IF EXISTS "approval_snapshots_immutable" ON "approval_snapshots";
DROP FUNCTION IF EXISTS "reject_approval_snapshot_mutation"();

DROP TABLE IF EXISTS "publication_revision_media";
DROP TABLE IF EXISTS "media_assets";
DROP TABLE IF EXISTS "approval_snapshots";
DROP TABLE IF EXISTS "publication_revisions";
DROP TABLE IF EXISTS "publications";
DROP TABLE IF EXISTS "locations";
DROP TABLE IF EXISTS "brands";
DROP TABLE IF EXISTS "organization_memberships";
DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "organizations";

DROP TYPE IF EXISTS "media_storage_provider";
DROP TYPE IF EXISTS "media_asset_origin";
DROP TYPE IF EXISTS "media_asset_status";
DROP TYPE IF EXISTS "publication_revision_status";
DROP TYPE IF EXISTS "publication_status";
DROP TYPE IF EXISTS "organization_role";
DROP TYPE IF EXISTS "membership_status";
DROP TYPE IF EXISTS "user_status";
