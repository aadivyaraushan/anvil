-- Migration 013: Relax NOT NULL on interviews.scheduled_at.
--
-- Migration 001 declared scheduled_at NOT NULL when every interview was
-- a future-scheduled meet/zoom. The Direction C flow lets users add an
-- interview without a time (in-person, ad-hoc desktop recording, "Anvil
-- will join" inline form left blank, etc.). The app's create path
-- already passes `scheduled_at: null` when the time field is empty, so
-- the schema was rejecting normal usage.
--
-- Idempotent: ALTER COLUMN ... DROP NOT NULL is a no-op when the column
-- is already nullable.

alter table interviews
  alter column scheduled_at drop not null;
