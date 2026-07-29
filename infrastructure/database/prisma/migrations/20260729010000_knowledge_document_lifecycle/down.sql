ALTER TABLE "knowledge_documents"
  DROP CONSTRAINT IF EXISTS "knowledge_documents_active_version_fkey";

DROP TABLE IF EXISTS "knowledge_document_versions";
DROP TABLE IF EXISTS "knowledge_documents";
DROP TYPE IF EXISTS "knowledge_remote_status";
DROP TYPE IF EXISTS "knowledge_document_version_status";
