-- Un tercer tipo de edición (`ADR-029`): elegir otro marco y cambiar título,
-- bajada, etiqueta y llamado a la acción desde la variante, sin pedirle nada
-- a un modelo. No lleva instrucción -- no hay nada que escribirle a la IA --
-- y en cambio lleva el marco elegido y el copy completo que reemplaza al que
-- derivaría el brief. Precio y vigencia siguen sin poder editarse: el worker
-- los vuelve a componer desde los mismos hechos verificados.
ALTER TABLE "generation_runs"
  ADD COLUMN "edit_layout" VARCHAR(60),
  ADD COLUMN "edit_copy" JSONB;

-- La restricción de `20260806000000_generation_edit_lineage` sólo conocía
-- `visual` y `factual`, y los dos exigían instrucción. Se rehace contemplando
-- las tres formas de editar: sin genealogía, con instrucción, o con marco y
-- copy.
ALTER TABLE "generation_runs"
  DROP CONSTRAINT "generation_runs_edit_check";

ALTER TABLE "generation_runs"
  ADD CONSTRAINT "generation_runs_edit_check" CHECK (
    (
      "parent_run_id" IS NULL
      AND "parent_variant_id" IS NULL
      AND "edit_kind" IS NULL
      AND "edit_instruction" IS NULL
      AND "edit_layout" IS NULL
      AND "edit_copy" IS NULL
      AND "lineage_root_id" = "id"
    )
    OR
    (
      "parent_run_id" IS NOT NULL
      AND "parent_variant_id" IS NOT NULL
      AND "edit_kind" IN ('visual', 'factual')
      AND char_length("edit_instruction") BETWEEN 8 AND 600
      AND "edit_layout" IS NULL
      AND "edit_copy" IS NULL
      AND "lineage_root_id" <> "id"
    )
    OR
    (
      "parent_run_id" IS NOT NULL
      AND "parent_variant_id" IS NOT NULL
      AND "edit_kind" = 'composition'
      AND "edit_instruction" IS NULL
      AND "edit_layout" IS NOT NULL
      AND "edit_copy" IS NOT NULL
      AND "lineage_root_id" <> "id"
    )
  );
