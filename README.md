# onrepeat.fm

One song. Seven days. A recreation of *This Is My Jam*, built natively on the [AT Protocol](https://atproto.com): post the one song you're into, it expires after a week, and you follow people to see their current jam. Jam/like records live in each user's own PDS; we run an AppView that ingests the firehose, resolves cross-platform play links, and serves the feeds.

## Stack

TypeScript (ESM, Node ≥ 22) · pnpm workspaces · Postgres + Kysely · Next.js 15 / React 19 · `@atproto` SDK · Vitest.

## Prerequisites

- **Node ≥ 22** and **pnpm 9** (`corepack enable`)
- **Postgres 16** reachable at `localhost:5432` — either [Postgres.app](https://postgresapp.com) or the bundled Docker container (`pnpm db:up`). See the note below.
- A **test Bluesky account** for the logged-in flows (don't use your main account).

## Quick start

```bash
pnpm setup     # install deps, create per-app .env.local files, generate a session secret, migrate
pnpm dev       # start web + ingester + resolver together (Ctrl-C stops all)
```

Then open **http://127.0.0.1:3000** and sign in with your test Bluesky handle.

> Use the loopback IP `127.0.0.1`, not `localhost` — atproto's loopback OAuth requires it.

## Commands

| Command | What it does |
|---|---|
| `pnpm setup` | One-time bootstrap (install, env files, migrate) |
| `pnpm dev` | Run **all** services concurrently (web · ingester · resolver) |
| `pnpm dev:web` | Just the Next.js app (for UI work — no firehose/resolver) |
| `pnpm dev:services` | Just the ingester + resolver |
| `pnpm db:up` / `pnpm db:down` | Start / stop the Docker Postgres |
| `pnpm db:migrate` | Apply migrations (defaults to `localhost:5432/onrepeat_test`) |
| `pnpm test` | Unit tests | 
| `pnpm test:int` | Integration tests (needs Postgres on :5432) |
| `pnpm typecheck` | Workspace-wide `tsc --noEmit` |

The three services each auto-load their own `apps/<app>/.env.local`; see the matching `.env.example` for the keys.

## Services

| App | Role |
|---|---|
| `apps/web` | Next.js UI + JSON read API + OAuth login / write actions |
| `apps/ingester` | Consumes the atproto firehose → indexes `fm.onrepeat.jam` / `like` into Postgres |
| `apps/resolver` | pg-boss worker → resolves tracks to cross-platform links via iTunes/Apple + YouTube; Bandcamp jams embed inline |

**Resolver API keys** — cross-resolution uses the iTunes/Apple Search API, which is **keyless and always on** — no credentials required. Bandcamp jams embed inline with no key either. YouTube cross-links are optional: get a free **YouTube Data API v3** key from [Google Cloud Console](https://console.cloud.google.com) and add it to `apps/resolver/.env.local`:

```
YOUTUBE_API_KEY=…
```

Without it the resolver still runs and provides Apple cross-links; you just won't get YouTube links. To re-resolve existing tracks: `pnpm --filter @onrepeat/resolver backfill`.

Packages: `@onrepeat/core` · `lexicons` · `db` · `repo` · `oauth` · `jobs` · `appview`.

## A note on Postgres (`:5432`)

Host processes (the apps, `tsx`, and the test runner) connect to **whatever is serving `localhost:5432`**.

- If you run **Postgres.app**, it serves `:5432` directly — you don't need `pnpm db:up`.
- `pnpm db:up` starts a **Docker** Postgres on `:5432` instead. Don't run both: the second one can't bind the port, and the Docker container is a *separate, empty* database from Postgres.app.

Pick one. To inspect the app's real data, query the same `:5432` your services use.

## Testing

Unit tests run with `pnpm test`. Integration tests (`pnpm test:int`) hit a real Postgres at `localhost:5432/onrepeat_test` and apply migrations themselves — bring the DB up first (`pnpm db:up` or Postgres.app + `pnpm db:migrate`).
