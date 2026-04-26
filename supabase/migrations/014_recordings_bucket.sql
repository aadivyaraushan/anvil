-- Migration 011: Recordings storage bucket
--
-- Creates the `recordings` bucket the upload route writes to
-- (apps/api/src/app/api/interviews/upload/route.ts) and the RLS policies
-- that scope each user to their own folder.
--
-- Storage path layout written by the upload route:
--   {user_id}/{project_id}/{interview_id}/{filename}
-- Position 1 of storage.foldername(name) is therefore the user_id, which is
-- what the RLS policies match against.

-- ── Bucket ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,                                   -- private; access via signed URLs
  524288000,                               -- 500 MB ceiling per object
  array[
    'audio/wav',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/m4a',
    'audio/webm',
    'audio/ogg'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── RLS policies on storage.objects ──────────────────────────────────────
-- The `service_role` bypasses RLS, so the upload route (which uses the
-- service-role client) can write regardless. These policies cover direct
-- access by the user-scoped client (e.g. signed URL refreshes, future
-- direct uploads from the browser).

drop policy if exists "recordings: users read own files"   on storage.objects;
drop policy if exists "recordings: users insert own files" on storage.objects;
drop policy if exists "recordings: users update own files" on storage.objects;
drop policy if exists "recordings: users delete own files" on storage.objects;

create policy "recordings: users read own files"
  on storage.objects for select
  using (
    bucket_id = 'recordings'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "recordings: users insert own files"
  on storage.objects for insert
  with check (
    bucket_id = 'recordings'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "recordings: users update own files"
  on storage.objects for update
  using (
    bucket_id = 'recordings'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "recordings: users delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'recordings'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
