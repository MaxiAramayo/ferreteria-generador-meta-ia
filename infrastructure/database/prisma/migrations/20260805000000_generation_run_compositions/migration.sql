-- `P4-T05`: la variante deja de ser sólo la base que devolvió el proveedor y
-- pasa a conservar también la pieza compuesta con la capa de marca.
--
-- Son dos activos distintos y los dos importan: la base prueba qué generó el
-- modelo y la pieza es lo que se publica. Guardar sólo la pieza perdería la
-- trazabilidad de la generación; guardar sólo la base obligaría a rehacer el
-- render cada vez que alguien quiere ver el resultado.

-- De dónde salió la variante. `deterministic` es la pieza que sale sin imagen
-- generada —el brief pidió plantilla, la generación está apagada o no hay foto
-- aprobada—: no gastó una llamada al proveedor, así que no tiene base ni
-- modelo, pero sí es una pieza terminada.
ALTER TABLE "generation_run_variants"
  ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'generated';

ALTER TABLE "generation_run_variants"
  ADD COLUMN "composed_media_asset_id" UUID,
  ADD COLUMN "composed_sha256" CHAR(64),
  ADD COLUMN "composed_width" INTEGER,
  ADD COLUMN "composed_height" INTEGER,
  ADD COLUMN "composition_layout" VARCHAR(60),
  ADD COLUMN "composition_theme" VARCHAR(40),
  ADD COLUMN "composition_version" VARCHAR(80),
  ADD COLUMN "composition_hash" CHAR(64),
  ADD COLUMN "composition_overlay_hash" CHAR(64);

ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_source_check" CHECK (
    "source" IN ('generated', 'deterministic')
  );

-- La composición es indivisible: o está entera —activo, hash, medidas, pieza,
-- tema y versión— o todavía no se compuso. Una fila con activo y sin hash no
-- permitiría comparar dos piezas ni saber con qué reglas se armó, que es para
-- lo que se guarda.
ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_composition_check" CHECK (
    (
      "composed_media_asset_id" IS NULL AND "composed_sha256" IS NULL
      AND "composed_width" IS NULL AND "composed_height" IS NULL
      AND "composition_layout" IS NULL AND "composition_theme" IS NULL
      AND "composition_version" IS NULL AND "composition_hash" IS NULL
      AND "composition_overlay_hash" IS NULL
    ) OR (
      "composed_media_asset_id" IS NOT NULL AND "composed_sha256" IS NOT NULL
      AND "composed_width" IS NOT NULL AND "composed_height" IS NOT NULL
      AND "composition_layout" IS NOT NULL AND "composition_theme" IS NOT NULL
      AND "composition_version" IS NOT NULL AND "composition_hash" IS NOT NULL
      AND "composition_overlay_hash" IS NOT NULL
    )
  );

-- Sólo una variante que salió puede tener pieza. Una fallida no tiene qué
-- componer y una descartada nunca se intentó.
--
-- La recíproca no se exige, y no es una omisión: las variantes que salieron
-- **antes** de esta migración no tienen pieza y no pueden tenerla. Componer
-- necesita los bytes de la base, y esos bytes sólo existen mientras la
-- generación está en curso: el almacenamiento guarda, borra y firma URLs, pero
-- no devuelve contenido. Exigir composición en toda fila `succeeded` haría que
-- esta migración no se pudiera aplicar sobre una base con historial.
--
-- Para las variantes nuevas el invariante lo sostiene el contrato, que es más
-- fuerte que un check: `GenerationVariantCompletion` lleva la composición
-- dentro de su rama `succeeded`, así que una variante que salió sin pieza ni
-- siquiera compila.
ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_composition_status_check" CHECK (
    "composition_hash" IS NULL OR "status" = 'succeeded'
  );

-- Una variante determinista no tiene base ni modelo: la pieza es enteramente
-- del motor. Una generada sí los tiene, y eso ya lo exige el check de resultado
-- que trajo `20260803000000_generation_runs`.
ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_deterministic_check" CHECK (
    "source" = 'generated' OR (
      "media_asset_id" IS NULL AND "sha256" IS NULL
      AND "width" IS NULL AND "height" IS NULL AND "model" IS NULL
    )
  );

-- El check de resultado original exige base para toda variante `succeeded`.
-- Una variante determinista sale sin base y con pieza, así que la regla se
-- rehace contemplando las dos formas de haber salido.
ALTER TABLE "generation_run_variants"
  DROP CONSTRAINT "generation_run_variants_outcome_check";

ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_outcome_check" CHECK (
    (
      "status" = 'pending'
      AND "media_asset_id" IS NULL AND "sha256" IS NULL
      AND "failure_code" IS NULL AND "completed_at" IS NULL
    ) OR (
      "status" = 'succeeded' AND "source" = 'generated'
      AND "media_asset_id" IS NOT NULL AND "sha256" IS NOT NULL
      AND "width" IS NOT NULL AND "height" IS NOT NULL
      AND "model" IS NOT NULL
      AND "failure_code" IS NULL AND "completed_at" IS NOT NULL
    ) OR (
      -- Una variante determinista no tiene base, así que su pieza es lo único
      -- que la hace existir: sin composición no habría nada que mostrar.
      "status" = 'succeeded' AND "source" = 'deterministic'
      AND "composition_hash" IS NOT NULL
      AND "failure_code" IS NULL AND "completed_at" IS NOT NULL
    ) OR (
      "status" = 'failed'
      AND "media_asset_id" IS NULL AND "sha256" IS NULL
      AND "failure_code" IS NOT NULL AND "failure_detail" IS NOT NULL
      AND "failure_correction" IS NOT NULL AND "completed_at" IS NOT NULL
    ) OR (
      "status" = 'discarded'
      AND "media_asset_id" IS NULL AND "sha256" IS NULL
      AND "failure_code" IS NULL AND "completed_at" IS NOT NULL
    )
  );

-- La clave es compuesta por organización: una pieza compuesta no puede
-- referenciar el activo de otra organización aunque alguien pase su
-- identificador.
ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_composed_asset_fkey"
  FOREIGN KEY ("organization_id", "composed_media_asset_id")
  REFERENCES "media_assets"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- La pieza compuesta se consulta por activo, igual que la base: es cómo se
-- responde «qué variantes referencian este archivo» antes de borrarlo, que es
-- lo que va a necesitar la barrida de retención de `P4-T07`.
CREATE INDEX "generation_run_variants_composed_asset_idx"
  ON "generation_run_variants" ("organization_id", "composed_media_asset_id");
