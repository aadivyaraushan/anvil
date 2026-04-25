-- Migration 010: Calendar connections + interview source field

-- Interview source enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'interview_source_type') then
    create type interview_source_type as enum ('desktop', 'cal', 'inperson', 'uploaded', 'meet_link');
  end if;
end$$;

-- Add source + attendee metadata to interviews
alter table interviews
  add column if not exists source interview_source_type not null default 'meet_link',
  add column if not exists attendee_name text,
  add column if not exists attendee_company text,
  add column if not exists duration_seconds int,
  add column if not exists recording_path text,     -- local path before upload
  add column if not exists upload_status text not null default 'none', -- none | queued | uploading | done | failed
  drop column if exists contact_id;                 -- contacts table is gone

-- Calendar connections table
create table if not exists calendar_connections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null default 'google',
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  calendar_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calendar_connections_user_id on calendar_connections(user_id);

alter table calendar_connections enable row level security;

-- Drop-and-recreate so the migration is idempotent on partially-applied
-- schemas. CREATE POLICY has no IF NOT EXISTS clause, so a bare retry
-- would error with "policy already exists".
drop policy if exists "Users can view own calendar connection" on calendar_connections;
create policy "Users can view own calendar connection"
  on calendar_connections for select using (auth.uid() = user_id);

drop policy if exists "Users can upsert own calendar connection" on calendar_connections;
create policy "Users can upsert own calendar connection"
  on calendar_connections for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own calendar connection" on calendar_connections;
create policy "Users can update own calendar connection"
  on calendar_connections for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own calendar connection" on calendar_connections;
create policy "Users can delete own calendar connection"
  on calendar_connections for delete using (auth.uid() = user_id);

-- desktop_connected_at on user_settings for "Desktop app connected" chip
alter table user_settings
  add column if not exists desktop_connected_at timestamptz;

-- updated_at trigger for calendar_connections (idempotent — CREATE TRIGGER
-- has no IF NOT EXISTS clause).
drop trigger if exists calendar_connections_updated_at on calendar_connections;
create trigger calendar_connections_updated_at
  before update on calendar_connections
  for each row execute function public.update_updated_at();
