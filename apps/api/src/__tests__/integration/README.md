# API integration tests

These tests hit a **real Supabase project** — they verify that schema, RLS,
and storage buckets agree with what the API code expects. They are the
backstop for the kind of failure that the unit tests cannot catch:

- A migration adds a NOT NULL column the upload route doesn't populate.
- The `recordings` storage bucket is missing or has wrong policies.
- A RLS policy on `interviews` blocks the service role unintentionally.
- A type in `lib/supabase/types.ts` drifts from the live schema.

## Running

Integration tests are **skipped by default** so `pnpm test` stays hermetic.
Opt in with:

```sh
INTEGRATION_TEST=1 \
NEXT_PUBLIC_SUPABASE_URL=https://<test-project>.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon> \
SUPABASE_SERVICE_ROLE_KEY=<service-role> \
TEST_USER_ID=<uuid of a row in auth.users on the test project> \
pnpm --filter api test:integration
```

`TEST_USER_ID` should be a throwaway user in the **test** Supabase project.
The suite writes one project + one interview row per test and cleans them up
in `afterAll`. Do not point it at production.

## Adding a test

Tests must:

1. Be gated by `describeIntegration` from `./harness.ts` — no real network
   calls when `INTEGRATION_TEST` is unset.
2. Tag every row they create with `__test_run` in metadata or use the helper
   `createTestProject(supabase)` so `afterAll` can sweep them.
3. Never assume an existing row — set up everything you need.
