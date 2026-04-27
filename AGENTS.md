<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Definition of Done (DO NOT SKIP)

Typecheck and build passing are necessary but **not sufficient**. Before reporting any feature/bug task complete, you must verify the **user-facing flow** end-to-end:

1. **Identify the flow your change affects.** Which user action triggers it? What persists (DB row, file, transcript, billing record)?
2. **Add or update a Playwright spec** in `apps/desktop/e2e/` (or `apps/marketing/e2e/`) that exercises the full flow. For data-touching changes, assert the row lands in Supabase using the existing helpers in `apps/desktop/e2e/helpers/db.ts` — do **not** stop at "the UI shows Saved."
3. **Run the targeted spec** before reporting done:
   ```
   pnpm --filter desktop test:e2e -- <spec-name>
   ```
   It must pass against a fresh dev server. If it also passed *before* your change, the spec didn't actually cover the bug — fix the spec first, watch it fail, then fix the code.
4. **For UI changes**, drive the flow yourself via the Playwright MCP server (`playwright_navigate`, `playwright_click`, etc.) and confirm there are no console errors.
5. If a step genuinely can't be done in this environment (e.g. flow needs a paid Stripe account, real OAuth consent screen), say so explicitly. Do **not** silently skip.

### Anti-patterns to avoid

- ❌ Mocking the very thing the bug lives in. The transcript-save bug shipped because `recording.spec.ts` mocked `**/rest/v1/projects**` and never exercised the actual upload+persist path.
- ❌ Asserting only that elements exist on the page. UI presence ≠ functionality.
- ❌ Reporting a fix as done because `pnpm typecheck` and `pnpm build` pass. They will pass for a button that does nothing.
