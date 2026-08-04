CREATE TYPE "knowledge_document_version_status" AS ENUM (
  'pending_upload',
  'uploaded',
  'indexing',
  'active',
  'superseded',
  'retiring',
  'retired',
  'sync_failed'
);

CREATE TYPE "knowledge_remote_status" AS ENUM (
  'not_uploaded',
  'uploaded',
  'in_progress',
  'completed',
  'failed',
  'detached'
);

CREATE TABLE "knowledge_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "source_key" VARCHAR(160) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "active_version_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_documents_source_key_check"
    CHECK ("source_key" ~ '^[a-z0-9][a-z0-9._-]{1,158}[a-z0-9]$')
);

CREATE TABLE "knowledge_document_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "byte_size" BIGINT NOT NULL,
  "document_type" VARCHAR(80) NOT NULL,
  "brand" VARCHAR(120) NOT NULL,
  "location_ids" JSONB NOT NULL,
  "source_owner" VARCHAR(120) NOT NULL,
  "sensitivity" VARCHAR(20) NOT NULL,
  "approval_reference" VARCHAR(160) NOT NULL,
  "approved_at" TIMESTAMPTZ(3) NOT NULL,
  "effective_from" TIMESTAMPTZ(3) NOT NULL,
  "effective_until" TIMESTAMPTZ(3),
  "status" "knowledge_document_version_status" NOT NULL DEFAULT 'pending_upload',
  "provider_vector_store_id" VARCHAR(120) NOT NULL,
  "provider_file_id" VARCHAR(120),
  "remote_status" "knowledge_remote_status" NOT NULL DEFAULT 'not_uploaded',
  "failure_code" VARCHAR(80),
  "failure_message" VARCHAR(300),
  "failure_retryable" BOOLEAN,
  "activated_at" TIMESTAMPTZ(3),
  "retired_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_document_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_document_versions_version_check"
    CHECK ("version" > 0),
  CONSTRAINT "knowledge_document_versions_hash_check"
    CHECK ("content_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "knowledge_document_versions_byte_size_check"
    CHECK ("byte_size" > 0 AND "byte_size" <= 10485760),
  CONSTRAINT "knowledge_document_versions_locations_check"
    CHECK (jsonb_typeof("location_ids") = 'array'),
  CONSTRAINT "knowledge_document_versions_sensitivity_check"
    CHECK ("sensitivity" IN ('public', 'internal', 'confidential')),
  CONSTRAINT "knowledge_document_versions_effective_range_check"
    CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from"),
  CONSTRAINT "knowledge_document_versions_mime_type_check"
    CHECK (
      "mime_type" IN (
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/markdown',
        'text/plain'
      )
    )
);

CREATE UNIQUE INDEX "knowledge_documents_organization_source_key"
  ON "knowledge_documents" ("organization_id", "source_key");
CREATE UNIQUE INDEX "knowledge_documents_organization_id_key"
  ON "knowledge_documents" ("organization_id", "id");
CREATE UNIQUE INDEX "knowledge_documents_active_version_key"
  ON "knowledge_documents" ("organization_id", "id", "active_version_id");
CREATE INDEX "knowledge_documents_organization_active_idx"
  ON "knowledge_documents" ("organization_id", "active_version_id");

CREATE UNIQUE INDEX "knowledge_document_versions_organization_id_key"
  ON "knowledge_document_versions" ("organization_id", "id");
CREATE UNIQUE INDEX "knowledge_document_versions_document_id_key"
  ON "knowledge_document_versions" ("organization_id", "document_id", "id");
CREATE UNIQUE INDEX "knowledge_document_versions_document_hash_key"
  ON "knowledge_document_versions" ("document_id", "content_hash");
CREATE UNIQUE INDEX "knowledge_document_versions_document_version_key"
  ON "knowledge_document_versions" ("organization_id", "document_id", "version");
CREATE INDEX "knowledge_document_versions_recovery_idx"
  ON "knowledge_document_versions" ("organization_id", "status", "updated_at", "id");
CREATE INDEX "knowledge_document_versions_remote_idx"
  ON "knowledge_document_versions" (
    "organization_id",
    "provider_vector_store_id",
    "provider_file_id"
  );

ALTER TABLE "knowledge_documents"
  ADD CONSTRAINT "knowledge_documents_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations" ("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "knowledge_document_versions"
  ADD CONSTRAINT "knowledge_document_versions_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations" ("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "knowledge_document_versions"
  ADD CONSTRAINT "knowledge_document_versions_document_fkey"
  FOREIGN KEY ("organization_id", "document_id")
  REFERENCES "knowledge_documents" ("organization_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "knowledge_documents"
  ADD CONSTRAINT "knowledge_documents_active_version_fkey"
  FOREIGN KEY ("organization_id", "id", "active_version_id")
  REFERENCES "knowledge_document_versions" ("organization_id", "document_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
