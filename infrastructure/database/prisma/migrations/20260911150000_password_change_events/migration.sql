ALTER TYPE "authentication_event_type"
  ADD VALUE IF NOT EXISTS 'password_changed';

ALTER TYPE "authentication_event_type"
  ADD VALUE IF NOT EXISTS 'password_change_failed';
