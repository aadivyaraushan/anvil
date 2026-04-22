# Anvil

A macOS desktop recorder that captures customer conversations (calendar calls, in-person, phone) and turns them into findings — built around LangGraph + Deepgram + Supabase.

## Monorepo layout

```
apps/
  desktop/    Next.js workspace UI (Tauri-wrapped as .dmg, also deployable as SSR web app)
  api/        Next.js API routes — LangGraph agents, Deepgram, Stripe, Google Calendar
  marketing/  Static marketing site (anvil.app)
supabase/     Migrations 001–011 (outreach removed; calendar, source, persona status added)
```

## Local development

```bash
pnpm install
pnpm dev:api         # http://localhost:3001
pnpm dev:desktop     # http://localhost:3000
pnpm dev:marketing   # http://localhost:3002
```

Env files to populate (see `.env.local` in each app):
- `apps/api/.env.local` — Supabase service role, OpenAI, Deepgram, Stripe, Google Calendar
- `apps/desktop/.env.local` — Supabase anon, `NEXT_PUBLIC_API_URL`, Stripe publishable

## Tests & checks

```bash
pnpm -r typecheck    # 3 apps clean
pnpm -r test         # 107 unit tests (87 desktop, 20 api)
pnpm --filter desktop test:e2e    # Playwright (needs a running dev server)
```

## Deployment

### Vercel (web)

This is a pnpm monorepo. Vercel needs to know which app to build. The cleanest setup is **one Vercel project per app**:

| App        | Vercel Root Directory | Framework |
|------------|----------------------|-----------|
| Desktop UI | `apps/desktop`       | Next.js   |
| API        | `apps/api`           | Next.js   |
| Marketing  | `apps/marketing`     | Next.js (static export) |

Each app has its own `vercel.json` that handles install/build from the repo root. To wire an existing Vercel project:

1. Project Settings → General → **Root Directory** → set to `apps/desktop` (or whichever app)
2. Framework preset: Next.js (auto-detected)
3. Env Vars: copy the corresponding `.env.local` keys into Vercel's Environment Variables tab

### Tauri desktop (.dmg)

```bash
BUILD_TARGET=tauri pnpm --filter desktop build
pnpm --filter desktop tauri build
```

CI builds signed + notarized .dmg on tagged releases (`v*.*.*`) — see `.github/workflows/release.yml`.

## Database

Migrations live in `supabase/migrations/`. Apply with:

```bash
supabase db push
```
