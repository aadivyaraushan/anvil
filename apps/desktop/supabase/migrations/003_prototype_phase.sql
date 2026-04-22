-- Add prototype_phase to track granular build progress
alter table projects
  add column if not exists prototype_phase text;
