-- Migration 012: Add customer_language to analyst_documents.
--
-- The Direction C findings rail (apps/desktop/src/components/project/
-- findings-rail.tsx) reads `analystDoc?.customer_language` as a top-level
-- jsonb array of strings, and the AnalystDocument TypeScript type has it
-- as a required field. None of migrations 001-011 actually added the
-- column, so the app reads `undefined` and the rail silently shows
-- nothing for customer-language chips.
--
-- Idempotent.

alter table analyst_documents
  add column if not exists customer_language jsonb not null default '[]'::jsonb;
