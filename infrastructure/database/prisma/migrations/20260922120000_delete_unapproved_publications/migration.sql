-- Eliminar una pieza que nunca fue evidencia (`ADR-032`).
--
-- El historial de publicaciones era inborrable en tres lugares: revisiones,
-- sus medios y las transiciones de estado. Esa garantía existe para lo que
-- salió: una pieza aprobada o publicada no se puede reescribir ni hacer
-- desaparecer. No existe para un borrador que nadie aprobó.
--
-- Los tres guardianes pasan a ser condicionales y la condición es la misma:
-- si hay un snapshot de aprobación de esa publicación, no se borra nada.
-- La garantía queda más precisa, no ausente, y la decide la base y no la
-- aplicación.

CREATE OR REPLACE FUNCTION "publication_has_approval"(publication UUID)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM "approval_snapshots" WHERE "publication_id" = publication
    );
$$;

CREATE OR REPLACE FUNCTION "protect_publication_revision_history"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF "publication_has_approval"(OLD."publication_id") THEN
            RAISE EXCEPTION 'approved publication revisions cannot be deleted'
                USING ERRCODE = '55000';
        END IF;

        RETURN OLD;
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
DECLARE
    owning_publication UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT "publication_id" INTO owning_publication
        FROM "publication_revisions"
        WHERE "id" = OLD."revision_id";

        -- Sin revisión dueña, el medio ya es huérfano: se va con ella.
        IF owning_publication IS NULL
            OR NOT "publication_has_approval"(owning_publication) THEN
            RETURN OLD;
        END IF;

        RAISE EXCEPTION 'approved publication revision media cannot be deleted'
            USING ERRCODE = '55000';
    END IF;

    RAISE EXCEPTION 'publication revision media is immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION "reject_publication_state_transition_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF "publication_has_approval"(OLD."publication_id") THEN
            RAISE EXCEPTION 'approved publication state transitions cannot be deleted'
                USING ERRCODE = '55000';
        END IF;

        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'publication state transitions are immutable'
        USING ERRCODE = '55000';
END;
$$;
