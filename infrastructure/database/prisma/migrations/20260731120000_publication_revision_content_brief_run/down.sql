DROP INDEX IF EXISTS "publication_revisions_brief_run_idx";

ALTER TABLE "publication_revisions"
  DROP CONSTRAINT "publication_revisions_content_brief_run_fkey";

ALTER TABLE "publication_revisions"
  DROP COLUMN "content_brief_run_id";

ALTER TABLE "content_brief_runs"
  DROP CONSTRAINT "content_brief_runs_organization_id_key";
