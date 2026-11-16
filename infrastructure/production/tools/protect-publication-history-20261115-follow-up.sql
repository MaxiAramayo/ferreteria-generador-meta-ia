-- Destino adicional observado después de la pausa, con la versión antigua.
-- Ejecutar con worker detenido y backup verificado; no crea envíos ni outbox.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $$
DECLARE
  affected publication_order_targets%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM audit_events
    WHERE organization_id = '10000000-0000-4000-8000-000000000001'
      AND operation = 'publishing.historical-protection:20261115:follow-up'
      AND entity_id = '3480e4b2-74c5-4664-9249-7825182f955c') THEN
    RAISE NOTICE 'El destino adicional ya tiene protección auditada.';
    RETURN;
  END IF;

  SELECT * INTO affected FROM publication_order_targets
  WHERE organization_id = '10000000-0000-4000-8000-000000000001'
    AND id = '3480e4b2-74c5-4664-9249-7825182f955c'
    AND order_id = '512489be-fca9-4f36-84a2-3b5f6a56af83'
    AND state = 'pending' AND sequence = 2
    AND remote_post_id IS NULL AND staged_media_id IS NULL
    AND next_attempt_at IS NULL AND failure_code IS NULL AND manual_reason IS NULL
    AND updated_at = '2026-11-15T20:00:09.462Z'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cambió el estado del destino adicional'; END IF;

  INSERT INTO audit_events (id, organization_id, operation, entity_type, entity_id, outcome, metadata, occurred_at)
  VALUES (gen_random_uuid(), affected.organization_id,
    'publishing.historical-protection:20261115:follow-up', 'publication_order_target', affected.id::text, 'success',
    jsonb_build_object('reason', 'production-remediation-no-historical-replay', 'orderId', affected.order_id,
      'previousState', affected.state, 'previousSequence', affected.sequence,
      'previousManualReason', affected.manual_reason, 'previousNextAttemptAt', affected.next_attempt_at), now());
  UPDATE publication_order_targets SET state = 'outcome_unknown', manual_reason = 'outcome-unresolved',
    next_attempt_at = NULL, sequence = sequence + 1, updated_at = now()
  WHERE id = affected.id AND organization_id = affected.organization_id;
END $$;
COMMIT;
