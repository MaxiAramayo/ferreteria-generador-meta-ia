-- Una alerta operativa conserva la observación, no el payload del proveedor.
-- La huella se forma únicamente con IDs internos y códigos de dominio; el
-- índice único vuelve idempotente cada barrido sin colapsar ocurrencias reales.
CREATE TABLE "publication_operational_alerts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "fingerprint" VARCHAR(180) NOT NULL,
  "kind" VARCHAR(50) NOT NULL,
  "cause" VARCHAR(80) NOT NULL,
  "severity" VARCHAR(20) NOT NULL,
  "safe_action" VARCHAR(40) NOT NULL,
  "publication_id" UUID,
  "publication_target" "publication_target_kind",
  "schedule_occurrence_id" UUID,
  "meta_connection_id" UUID,
  "observations" INTEGER NOT NULL DEFAULT 1,
  "first_observed_at" TIMESTAMPTZ(3) NOT NULL,
  "last_observed_at" TIMESTAMPTZ(3) NOT NULL,
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publication_operational_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publication_operational_alerts_observations_check"
    CHECK ("observations" > 0),
  CONSTRAINT "publication_operational_alerts_kind_check"
    CHECK ("kind" IN ('connection-degraded', 'occurrence-stuck', 'publication-manual-action')),
  CONSTRAINT "publication_operational_alerts_severity_check"
    CHECK ("severity" IN ('attention', 'urgent')),
  CONSTRAINT "publication_operational_alerts_safe_action_check"
    CHECK ("safe_action" IN ('inspect-queue', 'reconcile', 'reconnect-meta', 'retry')),
  CONSTRAINT "publication_operational_alerts_source_check"
    CHECK (
      ("kind" = 'connection-degraded'
        AND "meta_connection_id" IS NOT NULL
        AND "schedule_occurrence_id" IS NULL)
      OR
      ("kind" = 'occurrence-stuck'
        AND "schedule_occurrence_id" IS NOT NULL
        AND "meta_connection_id" IS NULL
        AND "publication_id" IS NOT NULL
        AND "publication_target" IS NOT NULL)
      OR
      ("kind" = 'publication-manual-action'
        AND "publication_id" IS NOT NULL
        AND "publication_target" IS NOT NULL)
    ),
  CONSTRAINT "publication_operational_alerts_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "publication_operational_alerts_org_fingerprint_key"
  ON "publication_operational_alerts"("organization_id", "fingerprint");

CREATE INDEX "publication_operational_alerts_open_idx"
  ON "publication_operational_alerts"("organization_id", "resolved_at", "last_observed_at" DESC);

CREATE INDEX "publication_operational_alerts_occurrence_idx"
  ON "publication_operational_alerts"("organization_id", "schedule_occurrence_id");
