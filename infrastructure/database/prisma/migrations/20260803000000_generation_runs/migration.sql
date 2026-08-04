CREATE TYPE "generation_run_status" AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE "generation_variant_status" AS ENUM (
  'pending',
  'succeeded',
  'failed',
  'discarded'
);

CREATE TABLE "generation_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "content_brief_run_id" UUID NOT NULL,
  "status" "generation_run_status" NOT NULL,
  "format" VARCHAR(40) NOT NULL,
  -- Si el sujeto tiene marca que respetar. Por defecto `branded`, que es el
  -- criterio conservador de `P4-T01`: exige foto real en lugar de dejar que el
  -- modelo dibuje una etiqueta.
  "subject_kind" VARCHAR(20) NOT NULL DEFAULT 'branded',
  "requested_at" TIMESTAMPTZ(3) NOT NULL,
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "profile_id" VARCHAR(80),
  "profile_version" VARCHAR(80),
  "prompt_version" VARCHAR(80),
  "prompt_hash" CHAR(64),
  "deterministic_reason" VARCHAR(80),
  "resolution_detail" VARCHAR(300),
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_usd" NUMERIC(12, 6),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id"),
  -- La base impide cualquier combinación que no describa un estado real. Un
  -- lote pendiente todavía no arrancó; uno en curso tiene instante de inicio y
  -- ningún cierre; uno terminado conserva ambos; uno cancelado conserva su
  -- instante de cancelación y nunca uno de cierre, porque cancelar no es
  -- terminar.
  CONSTRAINT "generation_runs_lifecycle_check" CHECK (
    (
      "status" = 'pending'
      AND "started_at" IS NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL
    ) OR (
      "status" = 'running'
      AND "started_at" IS NOT NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL
    ) OR (
      "status" IN ('completed', 'failed')
      AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL
    ) OR (
      "status" = 'cancelled'
      AND "cancelled_at" IS NOT NULL AND "completed_at" IS NULL
    )
  ),
  -- El plan visual es indivisible: o se conoce entero —perfil, versión, prompt
  -- y hash— o todavía no se construyó. Una fila con perfil y sin hash no
  -- permitiría comparar dos lotes, que es para lo que se guarda.
  CONSTRAINT "generation_runs_plan_check" CHECK (
    (
      "profile_id" IS NULL AND "profile_version" IS NULL
      AND "prompt_version" IS NULL AND "prompt_hash" IS NULL
    ) OR (
      "profile_id" IS NOT NULL AND "profile_version" IS NOT NULL
      AND "prompt_version" IS NOT NULL AND "prompt_hash" IS NOT NULL
    )
  ),
  -- Un lote resuelto sin gastar llamadas explica por qué. El motivo
  -- determinista puede faltar —el pedido pudo morir en la validación previa—
  -- pero nunca puede haber motivo sin detalle que lo acompañe.
  CONSTRAINT "generation_runs_resolution_check" CHECK (
    "deterministic_reason" IS NULL OR "resolution_detail" IS NOT NULL
  ),
  CONSTRAINT "generation_runs_tokens_check" CHECK ("total_tokens" >= 0),
  CONSTRAINT "generation_runs_subject_kind_check" CHECK (
    "subject_kind" IN ('branded', 'generic')
  )
);

ALTER TABLE "generation_runs"
  ADD CONSTRAINT "generation_runs_organization_id_key"
  UNIQUE ("organization_id", "id");

ALTER TABLE "generation_runs"
  ADD CONSTRAINT "generation_runs_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generation_runs"
  ADD CONSTRAINT "generation_runs_actor_fkey"
  FOREIGN KEY ("organization_id", "actor_membership_id")
  REFERENCES "organization_memberships"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- La clave es compuesta por organización, así que un lote no puede citar una
-- ejecución de brief ajena aunque alguien pase su identificador.
ALTER TABLE "generation_runs"
  ADD CONSTRAINT "generation_runs_content_brief_run_fkey"
  FOREIGN KEY ("organization_id", "content_brief_run_id")
  REFERENCES "content_brief_runs"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "generation_runs_org_requested_idx"
  ON "generation_runs" ("organization_id", "requested_at" DESC, "id");

CREATE INDEX "generation_runs_org_actor_idx"
  ON "generation_runs" ("organization_id", "actor_membership_id", "requested_at" DESC);

CREATE INDEX "generation_runs_org_brief_idx"
  ON "generation_runs" ("organization_id", "content_brief_run_id", "requested_at" DESC);

-- Sólo los lotes abiertos: es la consulta del worker y de quien sondea, y el
-- índice parcial no crece con el historial ya resuelto.
CREATE INDEX "generation_runs_open_idx"
  ON "generation_runs" ("organization_id", "status", "requested_at" DESC)
  WHERE "status" IN ('pending', 'running');

CREATE TABLE "generation_run_variants" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "generation_variant_status" NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "media_asset_id" UUID,
  "sha256" CHAR(64),
  "width" INTEGER,
  "height" INTEGER,
  "model" VARCHAR(120),
  "request_id" VARCHAR(120),
  "latency_milliseconds" INTEGER NOT NULL DEFAULT 0,
  "failure_code" VARCHAR(40),
  "failure_detail" VARCHAR(300),
  "failure_correction" VARCHAR(300),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "generation_run_variants_pkey" PRIMARY KEY ("id"),
  -- Una variante que salió conserva su activo, su hash y sus medidas, y no
  -- lleva fallo; una fallida conserva el motivo y no puede exponer un activo;
  -- una descartada —el lote se canceló antes de llegar a ella— no gastó nada,
  -- así que no tiene ni activo ni fallo que mostrar.
  CONSTRAINT "generation_run_variants_outcome_check" CHECK (
    (
      "status" = 'pending'
      AND "media_asset_id" IS NULL AND "sha256" IS NULL
      AND "failure_code" IS NULL AND "completed_at" IS NULL
    ) OR (
      "status" = 'succeeded'
      AND "media_asset_id" IS NOT NULL AND "sha256" IS NOT NULL
      AND "width" IS NOT NULL AND "height" IS NOT NULL
      AND "model" IS NOT NULL
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
  ),
  CONSTRAINT "generation_run_variants_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "generation_run_variants_position_check" CHECK ("position" >= 0)
);

ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_organization_id_key"
  UNIQUE ("organization_id", "id");

-- El índice dentro del lote es estable y único: ordena la presentación sin
-- depender del reloj y evita que una reentrega duplique una variante.
ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_position_key"
  UNIQUE ("organization_id", "run_id", "position");

ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_run_fkey"
  FOREIGN KEY ("organization_id", "run_id")
  REFERENCES "generation_runs"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generation_run_variants"
  ADD CONSTRAINT "generation_run_variants_media_asset_fkey"
  FOREIGN KEY ("organization_id", "media_asset_id")
  REFERENCES "media_assets"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "generation_run_variants_asset_idx"
  ON "generation_run_variants" ("organization_id", "media_asset_id");
