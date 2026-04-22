-- Step 1 restructure: drop prototype agent, rename discovery→outreach, synthesis→analyst

-- Drop trigger/function that inserted into synthesis_documents (recreated below for analyst_documents)
drop trigger if exists on_project_created on projects;
drop function if exists public.handle_new_project();
drop trigger if exists synthesis_documents_updated_at on synthesis_documents;

-- Projects: drop prototype columns
alter table projects
  drop column if exists prototype_url,
  drop column if exists prototype_repo_url,
  drop column if exists prototype_status,
  drop column if exists prototype_phase;

drop type if exists prototype_status;

-- Projects: rename discovery → outreach
alter table projects rename column discovery_status to outreach_status;
alter table projects rename column discovery_progress to outreach_progress;

-- Projects: rename synthesis_status → analyst_status
alter table projects rename column synthesis_status to analyst_status;

-- Synthesis docs → analyst docs
alter table synthesis_documents rename to analyst_documents;

alter index if exists idx_synthesis_documents_project_id rename to idx_analyst_documents_project_id;

-- Rename RLS policies on analyst_documents
alter policy "Users can view own synthesis docs" on analyst_documents rename to "Users can view own analyst docs";
alter policy "Users can create own synthesis docs" on analyst_documents rename to "Users can create own analyst docs";
alter policy "Users can update own synthesis docs" on analyst_documents rename to "Users can update own analyst docs";

-- Recreate updated_at trigger on renamed table
create trigger analyst_documents_updated_at
  before update on analyst_documents
  for each row execute function public.update_updated_at();

-- Recreate handle_new_project to insert into analyst_documents
create or replace function public.handle_new_project()
returns trigger as $$
begin
  insert into public.analyst_documents (project_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_project_created
  after insert on projects
  for each row execute function public.handle_new_project();
