-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'disabled');
CREATE TYPE "membership_status" AS ENUM ('active', 'revoked');
CREATE TYPE "organization_role" AS ENUM ('admin', 'editor', 'approver', 'publisher', 'viewer');
CREATE TYPE "publication_status" AS ENUM (
    'draft',
    'retrieving_context',
    'missing_information',
    'generating_assets',
    'ready_for_review',
    'approved',
    'scheduled',
    'publishing',
    'partially_published',
    'published',
    'generation_failed',
    'validation_failed',
    'publish_failed',
    'cancelled',
    'expired'
);
CREATE TYPE "publication_revision_status" AS ENUM ('draft', 'in_review', 'approved', 'superseded');
CREATE TYPE "media_asset_status" AS ENUM ('pending_upload', 'available', 'failed', 'pending_deletion', 'deleted');
CREATE TYPE "media_asset_origin" AS ENUM ('approved_library', 'commercial_system', 'generated', 'uploaded');
CREATE TYPE "media_storage_provider" AS ENUM ('brand_library', 'cloudinary');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(80) NOT NULL,
    "legal_name" VARCHAR(160) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organizations_versioned_timestamps_check" CHECK ("updated_at" >= "created_at")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_normalized_check" CHECK ("email" = lower("email")),
    CONSTRAINT "users_versioned_timestamps_check" CHECK ("updated_at" >= "created_at")
);

CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "roles" "organization_role"[] NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memberships_roles_not_empty_check" CHECK (cardinality("roles") > 0),
    CONSTRAINT "memberships_versioned_timestamps_check" CHECK ("updated_at" >= "created_at")
);

CREATE TABLE "brands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "profile" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "brands_version_check" CHECK ("version" > 0),
    CONSTRAINT "brands_versioned_timestamps_check" CHECK ("updated_at" >= "created_at")
);

CREATE TABLE "locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address_line" VARCHAR(200) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "province" VARCHAR(120) NOT NULL,
    "time_zone" VARCHAR(80) NOT NULL DEFAULT 'America/Argentina/Cordoba',
    "phone" VARCHAR(40),
    "whatsapp" VARCHAR(40),
    "opening_hours" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "locations_versioned_timestamps_check" CHECK ("updated_at" >= "created_at")
);

CREATE TABLE "publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID,
    "created_by_membership_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "status" "publication_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "scheduled_for" TIMESTAMPTZ(3),
    "time_zone" VARCHAR(80) NOT NULL DEFAULT 'America/Argentina/Cordoba',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "publications_version_check" CHECK ("version" > 0),
    CONSTRAINT "publications_versioned_timestamps_check" CHECK ("updated_at" >= "created_at")
);

CREATE TABLE "publication_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "created_by_membership_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "status" "publication_revision_status" NOT NULL DEFAULT 'draft',
    "schema_version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "design_document" JSONB NOT NULL,
    "content_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "publication_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "revisions_number_check" CHECK ("revision_number" > 0),
    CONSTRAINT "revisions_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "revisions_content_hash_check" CHECK (
        "content_hash" IS NULL OR "content_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "revisions_versioned_timestamps_check" CHECK ("updated_at" >= "created_at")
);

CREATE TABLE "approval_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "approved_by_membership_id" UUID NOT NULL,
    "approved_at" TIMESTAMPTZ(3) NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_snapshots_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "approval_snapshots_timestamps_check" CHECK (
        "updated_at" = "created_at" AND "approved_at" <= "created_at"
    )
);

CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "owner_membership_id" UUID NOT NULL,
    "origin" "media_asset_origin" NOT NULL,
    "status" "media_asset_status" NOT NULL DEFAULT 'pending_upload',
    "storage_provider" "media_storage_provider" NOT NULL,
    "storage_key" VARCHAR(255),
    "storage_version" INTEGER,
    "original_file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120),
    "byte_size" BIGINT,
    "checksum_sha256" CHAR(64),
    "width" INTEGER,
    "height" INTEGER,
    "secure_url" TEXT,
    "retention_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_assets_byte_size_check" CHECK ("byte_size" IS NULL OR "byte_size" > 0),
    CONSTRAINT "media_assets_checksum_check" CHECK (
        "checksum_sha256" IS NULL OR "checksum_sha256" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "media_assets_dimensions_check" CHECK (
        ("width" IS NULL AND "height" IS NULL)
        OR ("width" > 0 AND "height" > 0)
    ),
    CONSTRAINT "media_assets_secure_url_check" CHECK (
        "secure_url" IS NULL OR "secure_url" ~ '^https://'
    ),
    CONSTRAINT "media_assets_storage_version_check" CHECK (
        "storage_version" IS NULL OR "storage_version" > 0
    ),
    CONSTRAINT "media_assets_available_metadata_check" CHECK (
        "status" <> 'available'
        OR (
            "storage_key" IS NOT NULL
            AND "storage_version" IS NOT NULL
            AND "mime_type" IS NOT NULL
            AND "byte_size" IS NOT NULL
            AND "checksum_sha256" IS NOT NULL
            AND "secure_url" IS NOT NULL
        )
    ),
    CONSTRAINT "media_assets_versioned_timestamps_check" CHECK ("updated_at" >= "created_at")
);

CREATE TABLE "publication_revision_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "slot" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "publication_revision_media_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "revision_media_versioned_timestamps_check" CHECK ("updated_at" >= "created_at")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "memberships_user_status_idx" ON "organization_memberships"("user_id", "status");
CREATE UNIQUE INDEX "memberships_organization_user_key" ON "organization_memberships"("organization_id", "user_id");
CREATE UNIQUE INDEX "memberships_organization_id_key" ON "organization_memberships"("organization_id", "id");
CREATE UNIQUE INDEX "brands_organization_name_key" ON "brands"("organization_id", "name");
CREATE UNIQUE INDEX "brands_organization_id_key" ON "brands"("organization_id", "id");
CREATE INDEX "locations_org_active_name_idx" ON "locations"("organization_id", "is_active", "name");
CREATE UNIQUE INDEX "locations_organization_name_key" ON "locations"("organization_id", "name");
CREATE UNIQUE INDEX "locations_organization_id_key" ON "locations"("organization_id", "id");
CREATE INDEX "publications_org_status_created_idx" ON "publications"("organization_id", "status", "created_at" DESC, "id");
CREATE INDEX "publications_org_scheduled_idx" ON "publications"("organization_id", "scheduled_for", "id");
CREATE INDEX "publications_org_location_created_idx" ON "publications"("organization_id", "location_id", "created_at" DESC);
CREATE UNIQUE INDEX "publications_organization_id_key" ON "publications"("organization_id", "id");
CREATE INDEX "revisions_org_status_updated_idx" ON "publication_revisions"("organization_id", "status", "updated_at" DESC);
CREATE UNIQUE INDEX "revisions_organization_id_key" ON "publication_revisions"("organization_id", "id");
CREATE UNIQUE INDEX "revisions_publication_number_key" ON "publication_revisions"("organization_id", "publication_id", "revision_number");
CREATE INDEX "approval_snapshots_org_publication_approved_idx" ON "approval_snapshots"("organization_id", "publication_id", "approved_at" DESC);
CREATE UNIQUE INDEX "approval_snapshots_revision_key" ON "approval_snapshots"("organization_id", "revision_id");
CREATE UNIQUE INDEX "approval_snapshots_organization_id_key" ON "approval_snapshots"("organization_id", "id");
CREATE INDEX "media_assets_org_status_created_idx" ON "media_assets"("organization_id", "status", "created_at" DESC);
CREATE INDEX "media_assets_org_checksum_idx" ON "media_assets"("organization_id", "checksum_sha256");
CREATE UNIQUE INDEX "media_assets_organization_id_key" ON "media_assets"("organization_id", "id");
CREATE UNIQUE INDEX "media_assets_storage_version_key" ON "media_assets"("organization_id", "storage_provider", "storage_key", "storage_version");
CREATE INDEX "revision_media_org_asset_idx" ON "publication_revision_media"("organization_id", "media_asset_id");
CREATE UNIQUE INDEX "revision_media_slot_key" ON "publication_revision_media"("organization_id", "revision_id", "slot");

-- AddForeignKey: every tenant relation includes organization_id where needed,
-- so a valid identifier from another organization still fails.
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brands" ADD CONSTRAINT "brands_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_brand_id_fkey" FOREIGN KEY ("organization_id", "brand_id") REFERENCES "brands"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_organization_id_location_id_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_organization_id_created_by_membership_id_fkey" FOREIGN KEY ("organization_id", "created_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revisions" ADD CONSTRAINT "publication_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revisions" ADD CONSTRAINT "publication_revisions_organization_id_publication_id_fkey" FOREIGN KEY ("organization_id", "publication_id") REFERENCES "publications"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revisions" ADD CONSTRAINT "publication_revisions_organization_id_created_by_membershi_fkey" FOREIGN KEY ("organization_id", "created_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "approval_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "approval_snapshots_organization_id_publication_id_fkey" FOREIGN KEY ("organization_id", "publication_id") REFERENCES "publications"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "approval_snapshots_organization_id_revision_id_fkey" FOREIGN KEY ("organization_id", "revision_id") REFERENCES "publication_revisions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_snapshots" ADD CONSTRAINT "approval_snapshots_organization_id_approved_by_membership__fkey" FOREIGN KEY ("organization_id", "approved_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organization_id_owner_membership_id_fkey" FOREIGN KEY ("organization_id", "owner_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revision_media" ADD CONSTRAINT "publication_revision_media_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revision_media" ADD CONSTRAINT "publication_revision_media_organization_id_revision_id_fkey" FOREIGN KEY ("organization_id", "revision_id") REFERENCES "publication_revisions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revision_media" ADD CONSTRAINT "publication_revision_media_organization_id_media_asset_id_fkey" FOREIGN KEY ("organization_id", "media_asset_id") REFERENCES "media_assets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Approved snapshots are append-only. Their JSON contains the commercial,
-- design and media values required to reconstruct the approved piece.
CREATE FUNCTION "reject_approval_snapshot_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'approval snapshots are immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "approval_snapshots_immutable"
BEFORE UPDATE OR DELETE ON "approval_snapshots"
FOR EACH ROW
EXECUTE FUNCTION "reject_approval_snapshot_mutation"();
