-- Migration 011: Relax NOT NULL on meeting_platform / meeting_link.
--
-- Migration 001 declared both columns NOT NULL when every interview was
-- a Zoom or Meet link. The new Direction C flow added the 'inperson',
-- 'desktop', and 'uploaded' interview sources (see migration 010), none
-- of which have a meeting URL. The app's create-interview path passes
-- `null` for these columns when the user leaves the meet-link field
-- blank, which 500s against the original NOT NULL.
--
-- Idempotent: ALTER COLUMN ... DROP NOT NULL is a no-op when the column
-- is already nullable.

alter table interviews
  alter column meeting_platform drop not null,
  alter column meeting_link drop not null;
