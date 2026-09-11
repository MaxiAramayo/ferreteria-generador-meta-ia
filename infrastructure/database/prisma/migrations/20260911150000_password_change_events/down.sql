-- PostgreSQL no permite quitar un valor de enum. La versión anterior no conocía
-- el cambio de contraseña, así que el único downgrade compatible reetiqueta sus
-- eventos con el más cercano que sí conocía: un cambio fallido es un intento de
-- autenticación fallido, y un cambio exitoso revocó todas las sesiones. Se
-- conservan usuario, actor, instante, huellas y metadatos.
ALTER TABLE "authentication_events"
  DISABLE TRIGGER "authentication_events_immutable";

UPDATE "authentication_events"
SET "event_type" = 'login_failed'
WHERE "event_type"::text = 'password_change_failed';

UPDATE "authentication_events"
SET "event_type" = 'sessions_revoked'
WHERE "event_type"::text = 'password_changed';

ALTER TABLE "authentication_events"
  ENABLE TRIGGER "authentication_events_immutable";

CREATE TYPE "authentication_event_type_before_password_change" AS ENUM (
  'login_succeeded',
  'login_failed',
  'login_rate_limited',
  'session_revoked',
  'sessions_revoked',
  'membership_roles_changed',
  'membership_revoked'
);

ALTER TABLE "authentication_events"
  ALTER COLUMN "event_type"
  TYPE "authentication_event_type_before_password_change"
  USING "event_type"::text::"authentication_event_type_before_password_change";

DROP TYPE "authentication_event_type";
ALTER TYPE "authentication_event_type_before_password_change"
  RENAME TO "authentication_event_type";
