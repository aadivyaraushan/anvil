-- Add brief generation and Google Calendar sourcing support

-- Brief status enum
create type interview_brief_status as enum ('idle', 'generating', 'complete', 'failed');

-- Add new columns to interviews
alter table interviews
  add column if not exists brief jsonb,
  add column if not exists brief_status interview_brief_status not null default 'idle',
  add column if not exists calendar_event_id text,
  add column if not exists interviewee_name text,
  add column if not exists interviewee_email text;

create index if not exists idx_interviews_calendar_event_id on interviews(calendar_event_id)
  where calendar_event_id is not null;

-- Google OAuth tokens (1:1 with user, updated on re-auth)
create table if not exists user_google_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null
);

create index if not exists idx_user_google_tokens_user_id on user_google_tokens(user_id);

alter table user_google_tokens enable row level security;

create policy "Users can view own google token"
  on user_google_tokens for select using (auth.uid() = user_id);
create policy "Users can insert own google token"
  on user_google_tokens for insert with check (auth.uid() = user_id);
create policy "Users can update own google token"
  on user_google_tokens for update using (auth.uid() = user_id);
create policy "Users can delete own google token"
  on user_google_tokens for delete using (auth.uid() = user_id);
