-- PostgreSQL no permite quitar un valor de enum. La versión anterior conocía
-- este cambio como `advance` con su `reason_code`, por lo que ese es el único
-- downgrade compatible: conserva publicación, versiones, actor, instante y
-- causa auditados, aunque pierde la etiqueta más específica `unschedule`.
ALTER TABLE "publication_state_transitions"
  DISABLE TRIGGER "publication_state_transitions_immutable";

UPDATE "publication_state_transitions"
SET "command_type" = 'advance'
WHERE "command_type"::text = 'unschedule';

ALTER TABLE "publication_state_transitions"
  ENABLE TRIGGER "publication_state_transitions_immutable";

-- Estas dos restricciones comparan contra literales del enum. Se recrean luego
-- del cambio para que PostgreSQL no conserve una referencia al tipo extendido.
ALTER TABLE "publication_state_transitions"
  DROP CONSTRAINT "state_transitions_approval_check",
  DROP CONSTRAINT "state_transitions_edit_check";

CREATE TYPE "publication_transition_command_type_before_unschedule" AS ENUM (
  'advance',
  'approve',
  'cancel',
  'edit_approved',
  'expire',
  'fail'
);

ALTER TABLE "publication_state_transitions"
  ALTER COLUMN "command_type"
  TYPE "publication_transition_command_type_before_unschedule"
  USING "command_type"::text::"publication_transition_command_type_before_unschedule";

DROP TYPE "publication_transition_command_type";
ALTER TYPE "publication_transition_command_type_before_unschedule"
  RENAME TO "publication_transition_command_type";

ALTER TABLE "publication_state_transitions"
  ADD CONSTRAINT "state_transitions_approval_check" CHECK (
    ("command_type" = 'approve' AND "approval_snapshot_id" IS NOT NULL)
    OR ("command_type" <> 'approve' AND "approval_snapshot_id" IS NULL)
  ),
  ADD CONSTRAINT "state_transitions_edit_check" CHECK (
    ("command_type" = 'edit_approved' AND "new_revision_id" IS NOT NULL)
    OR ("command_type" <> 'edit_approved' AND "new_revision_id" IS NULL)
  );
