ALTER TABLE "publication_order_targets"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3),
  ADD COLUMN "manual_reason" VARCHAR(40),
  ADD COLUMN "reconciled_at" TIMESTAMPTZ(3);

ALTER TABLE "publication_order_targets"
  ADD CONSTRAINT "publication_order_targets_attempts_check"
    CHECK ("attempts" >= 0),
  ADD CONSTRAINT "publication_order_targets_manual_reason_format_check"
    CHECK ("manual_reason" IS NULL
           OR "manual_reason" ~ '^[a-z][a-z-]{0,39}$'),
  -- Un destino esperando el reintento y esperando a una persona al mismo tiempo
  -- describe dos futuros distintos. El worker leería uno y el panel el otro.
  ADD CONSTRAINT "publication_order_targets_pending_action_check"
    CHECK ("next_attempt_at" IS NULL OR "manual_reason" IS NULL),
  -- Un destino que salió no espera nada. Es lo que impide que reintentar la
  -- orden vuelva a tocar lo que ya se publicó.
  ADD CONSTRAINT "publication_order_targets_settled_idle_check"
    CHECK (
      "state" NOT IN ('published', 'published_unconfirmed')
      OR ("next_attempt_at" IS NULL AND "manual_reason" IS NULL)
    );

-- El worker de reintentos busca por fecha dentro de la organización; sin este
-- índice el barrido recorre todos los destinos de todas las órdenes.
CREATE INDEX "publication_order_targets_retry_due_idx"
  ON "publication_order_targets"("organization_id", "next_attempt_at")
  WHERE "next_attempt_at" IS NOT NULL;

-- Los que esperan decisión humana se listan para alertar.
CREATE INDEX "publication_order_targets_manual_idx"
  ON "publication_order_targets"("organization_id", "manual_reason")
  WHERE "manual_reason" IS NOT NULL;
