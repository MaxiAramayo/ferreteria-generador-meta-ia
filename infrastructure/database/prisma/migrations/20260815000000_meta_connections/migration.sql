CREATE TYPE "meta_connection_health" AS ENUM (
  'asset_removed',
  'healthy',
  'permission_revoked',
  'revoked',
  'token_expired'
);

CREATE TYPE "meta_asset_kind" AS ENUM ('instagram_business', 'page');
CREATE TYPE "meta_asset_status" AS ENUM ('active', 'removed');

CREATE UNIQUE INDEX "authentication_sessions_org_membership_id_key"
  ON "authentication_sessions"("organization_id", "membership_id", "id");

CREATE TABLE "meta_oauth_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "state_hash" CHAR(64) NOT NULL,
  "redirect_uri" VARCHAR(500) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meta_oauth_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meta_oauth_transactions_state_hash_format_check"
    CHECK ("state_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "meta_oauth_transactions_expiry_check"
    CHECK ("expires_at" > "created_at"),
  CONSTRAINT "meta_oauth_transactions_consumed_check"
    CHECK ("consumed_at" IS NULL OR "consumed_at" >= "created_at")
);

CREATE UNIQUE INDEX "meta_oauth_transactions_state_hash_key"
  ON "meta_oauth_transactions"("state_hash");
CREATE INDEX "meta_oauth_transactions_session_expiry_idx"
  ON "meta_oauth_transactions"("organization_id", "session_id", "expires_at");
CREATE INDEX "meta_oauth_transactions_expiry_idx"
  ON "meta_oauth_transactions"("expires_at", "consumed_at");

CREATE TABLE "meta_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "connected_by_membership_id" UUID NOT NULL,
  "provider_account_id" VARCHAR(160) NOT NULL,
  "account_name" VARCHAR(160) NOT NULL,
  "health" "meta_connection_health" NOT NULL,
  "granted_permissions" JSONB NOT NULL,
  "access_ciphertext" TEXT,
  "access_iv" VARCHAR(32),
  "access_tag" VARCHAR(32),
  "access_key_version" VARCHAR(40),
  "expires_at" TIMESTAMPTZ(3),
  "last_checked_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meta_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meta_connections_secret_complete_check" CHECK (
    ("access_ciphertext" IS NULL AND "access_iv" IS NULL AND "access_tag" IS NULL AND "access_key_version" IS NULL)
    OR
    ("access_ciphertext" IS NOT NULL AND "access_iv" IS NOT NULL AND "access_tag" IS NOT NULL AND "access_key_version" IS NOT NULL)
  ),
  CONSTRAINT "meta_connections_revocation_check" CHECK (
    ("health" = 'revoked' AND "revoked_at" IS NOT NULL AND "access_ciphertext" IS NULL)
    OR
    ("health" <> 'revoked' AND "revoked_at" IS NULL AND "access_ciphertext" IS NOT NULL)
  ),
  CONSTRAINT "meta_connections_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "meta_connections_organization_id_key"
  ON "meta_connections"("organization_id", "id");
CREATE UNIQUE INDEX "meta_connections_org_account_key"
  ON "meta_connections"("organization_id", "provider_account_id");
CREATE INDEX "meta_connections_org_health_idx"
  ON "meta_connections"("organization_id", "health", "updated_at" DESC);

CREATE TABLE "meta_connection_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "meta_connection_id" UUID NOT NULL,
  "provider_asset_id" VARCHAR(160) NOT NULL,
  "kind" "meta_asset_kind" NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "username" VARCHAR(160),
  "status" "meta_asset_status" NOT NULL DEFAULT 'active',
  "access_ciphertext" TEXT,
  "access_iv" VARCHAR(32),
  "access_tag" VARCHAR(32),
  "access_key_version" VARCHAR(40),
  "removed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meta_connection_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meta_connection_assets_secret_complete_check" CHECK (
    ("access_ciphertext" IS NULL AND "access_iv" IS NULL AND "access_tag" IS NULL AND "access_key_version" IS NULL)
    OR
    ("access_ciphertext" IS NOT NULL AND "access_iv" IS NOT NULL AND "access_tag" IS NOT NULL AND "access_key_version" IS NOT NULL)
  ),
  CONSTRAINT "meta_connection_assets_removed_check" CHECK (
    ("status" = 'removed' AND "removed_at" IS NOT NULL AND "access_ciphertext" IS NULL)
    OR
    ("status" = 'active' AND "removed_at" IS NULL)
  )
);

CREATE UNIQUE INDEX "meta_connection_assets_org_kind_provider_key"
  ON "meta_connection_assets"("organization_id", "kind", "provider_asset_id");
CREATE INDEX "meta_connection_assets_connection_status_idx"
  ON "meta_connection_assets"("organization_id", "meta_connection_id", "status");

ALTER TABLE "meta_oauth_transactions"
  ADD CONSTRAINT "meta_oauth_transactions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_oauth_transactions"
  ADD CONSTRAINT "meta_oauth_transactions_actor_membership_id_fkey"
  FOREIGN KEY ("organization_id", "actor_membership_id")
  REFERENCES "organization_memberships"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_oauth_transactions"
  ADD CONSTRAINT "meta_oauth_transactions_session_id_fkey"
  FOREIGN KEY ("organization_id", "actor_membership_id", "session_id")
  REFERENCES "authentication_sessions"("organization_id", "membership_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meta_connections"
  ADD CONSTRAINT "meta_connections_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_connections"
  ADD CONSTRAINT "meta_connections_connected_by_membership_id_fkey"
  FOREIGN KEY ("organization_id", "connected_by_membership_id")
  REFERENCES "organization_memberships"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meta_connection_assets"
  ADD CONSTRAINT "meta_connection_assets_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_connection_assets"
  ADD CONSTRAINT "meta_connection_assets_meta_connection_id_fkey"
  FOREIGN KEY ("organization_id", "meta_connection_id")
  REFERENCES "meta_connections"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
