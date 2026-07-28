DROP TRIGGER IF EXISTS "publication_state_transitions_immutable"
    ON "publication_state_transitions";
DROP FUNCTION IF EXISTS "reject_publication_state_transition_mutation"();
DROP TABLE IF EXISTS "publication_state_transitions";

ALTER TABLE "publications"
    DROP CONSTRAINT IF EXISTS "publications_failure_code_check",
    DROP CONSTRAINT IF EXISTS "publications_failure_complete_check",
    DROP COLUMN IF EXISTS "failure_occurred_at",
    DROP COLUMN IF EXISTS "failure_retryable",
    DROP COLUMN IF EXISTS "failure_message",
    DROP COLUMN IF EXISTS "failure_code";

DROP TYPE IF EXISTS "publication_transition_command_type";
