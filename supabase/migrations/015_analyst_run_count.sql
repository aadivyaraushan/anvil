-- Track lifetime analyst-run count per project so the free plan can be
-- gated at 1 run per project. Existing rows default to 0 (no runs yet);
-- saveAnalyst (apps/api/src/lib/agents/analyst/nodes.ts) increments this
-- on every successful upsert of analyst_documents.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS analyst_run_count integer NOT NULL DEFAULT 0;
