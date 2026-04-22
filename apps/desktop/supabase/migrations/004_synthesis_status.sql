-- Add synthesis_status to projects for UI state tracking
alter table projects
  add column if not exists synthesis_status text not null default 'idle';
