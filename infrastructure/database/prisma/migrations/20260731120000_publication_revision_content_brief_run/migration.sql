-- Una revisión que salió de un brief conserva de cuál. Sin esto, la
-- trazabilidad desde la pieza hasta su evidencia dependería de recomponerla
-- en la UI, que es justamente donde deja de ser verificable.
ALTER TABLE "content_brief_runs"
  ADD CONSTRAINT "content_brief_runs_organization_id_key"
  UNIQUE ("organization_id", "id");

ALTER TABLE "publication_revisions"
  ADD COLUMN "content_brief_run_id" UUID;

-- La clave es compuesta por organización: una revisión no puede citar la
-- ejecución de otra organización aunque alguien envíe su identificador.
ALTER TABLE "publication_revisions"
  ADD CONSTRAINT "publication_revisions_content_brief_run_fkey"
  FOREIGN KEY ("organization_id", "content_brief_run_id")
  REFERENCES "content_brief_runs" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "publication_revisions_brief_run_idx"
  ON "publication_revisions" ("organization_id", "content_brief_run_id");
