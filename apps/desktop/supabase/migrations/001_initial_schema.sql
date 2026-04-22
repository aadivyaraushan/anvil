-- Anvil: initial database schema
-- Run this in Supabase SQL Editor or via supabase db push

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Enums
create type prototype_status as enum ('pending', 'generating', 'deployed', 'failed');
create type contact_source as enum ('apollo', 'csv');
create type fit_status as enum ('passed', 'skipped');
create type outreach_status as enum ('pending', 'drafted', 'approved', 'sent', 'replied');
create type meeting_platform as enum ('zoom', 'google_meet');
create type interview_status as enum ('scheduled', 'live', 'completed');
create type chat_role as enum ('user', 'assistant');

-- Projects
create table projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_profile text not null default '',
  idea_description text not null default '',
  prototype_url text,
  prototype_repo_url text,
  prototype_status prototype_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index idx_projects_user_id on projects(user_id);

-- Contacts
create table contacts (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  source contact_source not null default 'apollo',
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  title text not null default '',
  company text not null default '',
  linkedin_url text not null default '',
  company_website text not null default '',
  industry text not null default '',
  location text not null default '',
  research_brief jsonb,
  fit_score float,
  fit_status fit_status,
  outreach_status outreach_status not null default 'pending',
  email_draft text,
  email_sent_at timestamptz,
  apollo_data jsonb
);

create index idx_contacts_project_id on contacts(project_id);
create index idx_contacts_outreach_status on contacts(outreach_status);

-- Interviews
create table interviews (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  meeting_platform meeting_platform not null,
  meeting_link text not null,
  scheduled_at timestamptz not null,
  status interview_status not null default 'scheduled',
  transcript jsonb not null default '[]'::jsonb,
  suggested_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_interviews_project_id on interviews(project_id);
create index idx_interviews_status on interviews(status);

-- Synthesis Documents (1:1 with projects)
create table synthesis_documents (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null unique references projects(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  pain_points jsonb not null default '[]'::jsonb,
  patterns jsonb not null default '[]'::jsonb,
  key_quotes jsonb not null default '[]'::jsonb,
  saturation_score float not null default 0,
  interview_count int not null default 0,
  unique_pattern_count int not null default 0,
  updated_at timestamptz not null default now()
);

create index idx_synthesis_documents_project_id on synthesis_documents(project_id);

-- Chat Messages (synthesis chat)
create table chat_messages (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  role chat_role not null,
  content text not null,
  "references" jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_chat_messages_project_id on chat_messages(project_id);

-- User Settings (1:1 with users)
create table user_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  sender_email text not null default '',
  sender_name text not null default '',
  resend_api_key text not null default '',
  apollo_api_key text not null default '',
  auto_send_enabled boolean not null default false,
  review_before_send boolean not null default true
);

create index idx_user_settings_user_id on user_settings(user_id);

-- RLS Policies
alter table projects enable row level security;
alter table contacts enable row level security;
alter table interviews enable row level security;
alter table synthesis_documents enable row level security;
alter table chat_messages enable row level security;
alter table user_settings enable row level security;

-- Projects: users can only access their own
create policy "Users can view own projects"
  on projects for select using (auth.uid() = user_id);
create policy "Users can create own projects"
  on projects for insert with check (auth.uid() = user_id);
create policy "Users can update own projects"
  on projects for update using (auth.uid() = user_id);
create policy "Users can delete own projects"
  on projects for delete using (auth.uid() = user_id);

-- Contacts: access via project ownership
create policy "Users can view contacts in own projects"
  on contacts for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can create contacts in own projects"
  on contacts for insert with check (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can update contacts in own projects"
  on contacts for update using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can delete contacts in own projects"
  on contacts for delete using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Interviews: access via project ownership
create policy "Users can view interviews in own projects"
  on interviews for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can create interviews in own projects"
  on interviews for insert with check (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can update interviews in own projects"
  on interviews for update using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can delete interviews in own projects"
  on interviews for delete using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Synthesis Documents: access via project ownership
create policy "Users can view own synthesis docs"
  on synthesis_documents for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can create own synthesis docs"
  on synthesis_documents for insert with check (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can update own synthesis docs"
  on synthesis_documents for update using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Chat Messages: access via project ownership
create policy "Users can view chat in own projects"
  on chat_messages for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can create chat in own projects"
  on chat_messages for insert with check (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- User Settings: users can only access their own
create policy "Users can view own settings"
  on user_settings for select using (auth.uid() = user_id);
create policy "Users can create own settings"
  on user_settings for insert with check (auth.uid() = user_id);
create policy "Users can update own settings"
  on user_settings for update using (auth.uid() = user_id);

-- Auto-create user_settings row on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_settings (user_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-create synthesis_document when project is created
create or replace function public.handle_new_project()
returns trigger as $$
begin
  insert into public.synthesis_documents (project_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_project_created
  after insert on projects
  for each row execute function public.handle_new_project();

-- Auto-update updated_at on synthesis_documents
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger synthesis_documents_updated_at
  before update on synthesis_documents
  for each row execute function public.update_updated_at();
