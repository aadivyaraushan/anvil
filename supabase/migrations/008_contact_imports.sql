-- Step 3: imported outreach contacts for V1.
-- Idempotent: safe to re-run after migration 009 has dropped contacts/types,
-- or against a DB where the column was already renamed.

do $$
begin
  if exists (select 1 from pg_type where typname = 'contact_source') then
    alter type contact_source add value if not exists 'json';
  end if;
end$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'apollo_data'
  ) then
    alter table contacts rename column apollo_data to source_payload;
  end if;
end$$;

alter table user_settings
  drop column if exists apollo_api_key;
