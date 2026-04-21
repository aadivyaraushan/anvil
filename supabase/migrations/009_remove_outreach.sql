-- Remove all outreach-related columns, types, and indexes

-- Drop outreach index
drop index if exists idx_contacts_outreach_status;

-- Drop outreach columns from contacts
alter table contacts
  drop column if exists source,
  drop column if exists research_brief,
  drop column if exists fit_score,
  drop column if exists fit_status,
  drop column if exists outreach_status,
  drop column if exists email_draft,
  drop column if exists email_sent_at,
  drop column if exists source_payload;

-- Drop outreach columns from projects
alter table projects
  drop column if exists outreach_status,
  drop column if exists outreach_progress;

-- Drop outreach columns from user_settings
alter table user_settings
  drop column if exists sender_email,
  drop column if exists sender_name,
  drop column if exists resend_api_key,
  drop column if exists auto_send_enabled,
  drop column if exists review_before_send;

-- Drop outreach enums (safe to ignore if they don't exist)
drop type if exists contact_source;
drop type if exists fit_status;
drop type if exists outreach_status;
