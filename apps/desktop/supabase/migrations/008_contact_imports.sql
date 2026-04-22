-- Step 3: imported outreach contacts for V1

alter type contact_source add value if not exists 'json';

alter table contacts
  rename column apollo_data to source_payload;

alter table user_settings
  drop column if exists apollo_api_key;
