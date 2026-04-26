-- Migration 009: Remove outreach agent (contacts, imports, outreach columns)
-- The product no longer imports CSV/JSON prospect lists or sends emails.
-- Interviews come from calendar or desktop recording only.

-- Drop contacts table (cascades to FK on interviews.contact_id)
drop table if exists contacts cascade;

-- Drop outreach-related enum types (only if not referenced elsewhere)
drop type if exists contact_source cascade;
drop type if exists fit_status cascade;
drop type if exists outreach_status cascade;

-- Remove outreach columns from projects
alter table projects
  drop column if exists outreach_status,
  drop column if exists outreach_progress,
  drop column if exists archetypes_verified;

-- Remove Resend / email columns from user_settings
alter table user_settings
  drop column if exists sender_email,
  drop column if exists sender_name,
  drop column if exists resend_api_key,
  drop column if exists auto_send_enabled,
  drop column if exists review_before_send;

-- Remove apollo_api_key if still present from v1
alter table user_settings
  drop column if exists apollo_api_key;

-- Add persona status for soft-proposed archetypes.
-- Earlier draft used `alter type ... rename ... 2>/dev/null` — that's
-- bash redirection inside SQL, which Postgres parses as `2 > /dev/null`
-- and rejects. Replaced with a pure DO-block that creates the type only
-- if missing. If a stale persona_status_type exists with the wrong
-- values, that's a manual cleanup, not something we silently rename.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'persona_status_type') then
    create type persona_status_type as enum ('suggested', 'confirmed');
  end if;
end$$;

alter table personas
  add column if not exists status persona_status_type not null default 'confirmed';
