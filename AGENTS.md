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

## Two e2e suites: which one to write in

We ship a desktop app via Tauri and a browser experience via the same Next.js codebase. Bugs come from both — write the spec in the suite that exercises the layer the bug lives in.

| Layer your change touches                       | Write spec in                              |
| ----------------------------------------------- | ------------------------------------------ |
| UI / React state / API calls / Supabase RLS     | `apps/desktop/e2e/` (browser, Chromium)    |
| `@tauri-apps/api`, `invoke()`, Tauri events     | `apps/desktop/e2e-tauri/` (real WKWebView) |
| Native window, tray, deep link, global shortcut | `apps/desktop/e2e-tauri/`                  |
| Real audio capture / file I/O / mic permission  | `apps/desktop/e2e-tauri/`                  |
| macOS WKWebView render / scroll / focus quirks  | `apps/desktop/e2e-tauri/`                  |

**The browser suite cannot fail on a real Tauri-only bug**, even if it looks like it covers the flow. If your change touches anything in the second column, the bug is invisible to Chromium — write the Tauri spec.

### Running the Tauri suite

```bash
# In one terminal (boots the Next.js dev servers)
pnpm --filter desktop dev          # :3000
pnpm --filter api dev              # :3001  (set ANVIL_LLM_MODE=mock for mocked LLM)

# In another terminal — global-setup spawns `cargo tauri dev --features e2e`
pnpm --filter desktop test:e2e:tauri
```

First run on macOS will trigger the system mic-permission prompt. Approve it once; CI pre-grants via TCC database manipulation (see `.github/workflows/tauri-build.yml` `e2e-tauri` job).

Test-only Rust commands (`__test_get_tray_state`, `__test_dispatch_deep_link`, `__test_get_last_deep_link`) and the `tauri-plugin-playwright` dependency are gated behind the `e2e` Cargo feature in `apps/desktop/src-tauri/Cargo.toml`. **Production DMGs do not include them** — verify with `nm` if changing the Cargo manifest.
