-- Step 2: personas (archetypes) table + verification flag

-- Archetypes / personas per project
create table personas (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text not null,
  job_titles text[] not null default '{}',
  pain_points text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_personas_project_id on personas(project_id);

alter table personas enable row level security;

create policy "Users can view personas in own projects"
  on personas for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can create personas in own projects"
  on personas for insert with check (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can update personas in own projects"
  on personas for update using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can delete personas in own projects"
  on personas for delete using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Track whether the founder has confirmed their archetypes
alter table projects
  add column if not exists archetypes_verified boolean not null default false;

-- Link interviews and contacts to an archetype (nullable — tagged during the flow)
alter table interviews
  add column if not exists persona_id uuid references personas(id) on delete set null;

alter table contacts
  add column if not exists persona_id uuid references personas(id) on delete set null;
