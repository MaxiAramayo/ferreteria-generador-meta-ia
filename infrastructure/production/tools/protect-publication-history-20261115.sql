-- Ejecutar con el worker detenido y backup verificado. No publica ni crea outbox.
-- Sólo admite los seis destinos observados el 15/11; una divergencia aborta todo.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $$
DECLARE
  affected record;
  audited integer;
  matched integer;
BEGIN
  SELECT count(*) INTO audited FROM audit_events
  WHERE organization_id = '10000000-0000-4000-8000-000000000001'
    AND operation = 'publishing.historical-protection:20261115';
  IF audited = 6 THEN
    RAISE NOTICE 'Los seis destinos ya tienen protección auditada.';
    RETURN;
  END IF;
  IF audited <> 0 THEN RAISE EXCEPTION 'Protección parcial inesperada: %', audited; END IF;

  PERFORM id FROM publication_order_targets
  WHERE organization_id = '10000000-0000-4000-8000-000000000001'
    AND id IN (
      'be7f0d60-6a1a-4c92-afb2-5912ccb625a0', '25917daf-74d0-4042-b452-a3a00f08e434',
      'ad3df6ae-6ea0-4879-a49f-6316fb698388', 'f0829e95-8e4a-4d4a-a7ba-09d52548dc22',
      'd5f25d82-38a4-41f8-a059-5ed1e5bfecd2', 'ecd3b9b9-5337-4f7f-8ad8-a1b82486f3ee'
    ) FOR UPDATE;
  SELECT count(*) INTO matched FROM publication_order_targets
  WHERE organization_id = '10000000-0000-4000-8000-000000000001'
    AND target = 'instagram_story' AND remote_post_id IS NULL
    AND ((id IN ('be7f0d60-6a1a-4c92-afb2-5912ccb625a0', '25917daf-74d0-4042-b452-a3a00f08e434',
                 'd5f25d82-38a4-41f8-a059-5ed1e5bfecd2', 'ecd3b9b9-5337-4f7f-8ad8-a1b82486f3ee')
          AND state = 'pending' AND sequence = 2 AND staged_media_id IS NULL)
      OR (id IN ('ad3df6ae-6ea0-4879-a49f-6316fb698388', 'f0829e95-8e4a-4d4a-a7ba-09d52548dc22')
          AND state = 'failed' AND sequence = 3 AND failure_code = 'permission-denied'));
  IF matched <> 6 THEN RAISE EXCEPTION 'Cambió el estado de los históricos: coinciden % de 6', matched; END IF;

  FOR affected IN SELECT * FROM publication_order_targets
    WHERE id IN ('be7f0d60-6a1a-4c92-afb2-5912ccb625a0', '25917daf-74d0-4042-b452-a3a00f08e434',
                 'ad3df6ae-6ea0-4879-a49f-6316fb698388', 'f0829e95-8e4a-4d4a-a7ba-09d52548dc22',
                 'd5f25d82-38a4-41f8-a059-5ed1e5bfecd2', 'ecd3b9b9-5337-4f7f-8ad8-a1b82486f3ee')
      AND organization_id = '10000000-0000-4000-8000-000000000001'
  LOOP
    INSERT INTO audit_events (id, organization_id, operation, entity_type, entity_id, outcome, metadata, occurred_at)
    VALUES (gen_random_uuid(), affected.organization_id, 'publishing.historical-protection:20261115',
      'publication_order_target', affected.id::text, 'success',
      jsonb_build_object('reason', 'production-remediation-no-historical-replay', 'orderId', affected.order_id,
        'previousState', affected.state, 'previousSequence', affected.sequence,
        'previousManualReason', affected.manual_reason, 'previousNextAttemptAt', affected.next_attempt_at), now());
    UPDATE publication_order_targets SET
      state = CASE WHEN affected.state = 'pending' THEN 'outcome_unknown'::publication_attempt_state ELSE state END,
      manual_reason = CASE WHEN affected.state = 'pending' THEN 'outcome-unresolved' ELSE 'permanent-failure' END,
      next_attempt_at = NULL, sequence = sequence + 1, updated_at = now()
    WHERE id = affected.id AND organization_id = affected.organization_id;
  END LOOP;
END $$;
COMMIT;
