-- Vuelve a hacer inborrable todo el historial de publicaciones.

CREATE OR REPLACE FUNCTION "protect_publication_revision_history"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'publication revisions cannot be deleted'
            USING ERRCODE = '55000';
    END IF;

    IF OLD."organization_id" IS DISTINCT FROM NEW."organization_id"
        OR OLD."publication_id" IS DISTINCT FROM NEW."publication_id"
        OR OLD."created_by_membership_id" IS DISTINCT FROM NEW."created_by_membership_id"
        OR OLD."revision_number" IS DISTINCT FROM NEW."revision_number"
        OR OLD."schema_version" IS DISTINCT FROM NEW."schema_version"
        OR OLD."content" IS DISTINCT FROM NEW."content"
        OR OLD."design_document" IS DISTINCT FROM NEW."design_document"
        OR OLD."content_hash" IS DISTINCT FROM NEW."content_hash"
        OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
        RAISE EXCEPTION 'publication revision content is immutable'
            USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "reject_revision_media_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'publication revision media is immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION "reject_publication_state_transition_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'publication state transitions are immutable'
        USING ERRCODE = '55000';
END;
$$;

DROP FUNCTION IF EXISTS "publication_has_approval"(UUID);
