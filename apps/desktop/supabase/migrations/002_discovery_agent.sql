alter table projects
  add column if not exists discovery_status text not null default 'idle'
    check (discovery_status in ('idle', 'running', 'partial', 'complete')),
  add column if not exists discovery_progress integer not null default 0;
