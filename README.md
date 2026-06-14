# onrepeat.fm

One song. Seven days. Post the single track you're into right now — it expires after a week — and follow people to see what they're currently playing. Built natively on the [AT Protocol](https://atproto.com): jam/like records live in each user's own PDS, and we run an AppView that ingests the firehose, resolves cross-platform play links, and serves the feeds.

## Stack

TypeScript (ESM, Node ≥ 22) · pnpm workspaces · Postgres + Kysely · Next.js 15 / React 19 · `@atproto` SDK · Vitest.

## Prerequisites

- **Node ≥ 22** and **pnpm 9** (`corepack enable`). The version is pinned in `.nvmrc` — run `nvm use` (or `nvm install 22`) to match it. `engine-strict` is on, so pnpm refuses to run on an older Node rather than failing later in tests.
- **Postgres 16** reachable at `localhost:5432` — either [Postgres.app](https://postgresapp.com) or the bundled Docker container (`pnpm db:up`). See the note below.
- A **test Bluesky account** for the logged-in flows (don't use your main account).

## Quick start

```bash
pnpm setup     # install deps, create per-app .env.local files, generate a session secret, migrate
pnpm dev       # start web + ingester + resolver together (Ctrl-C stops all)
```

Then open **http://127.0.0.1:3000** and sign in with your test Bluesky handle.

> Use the loopback IP `127.0.0.1`, not `localhost` — atproto's loopback OAuth requires it.

**Empty feeds?** Seed the local index with sample jams from real public Bluesky accounts so the feeds, profiles, and themes have something to show:

```bash
pnpm seed         # add sample data
pnpm seed:clean   # revert it
```

This writes local index rows only — nothing is pushed to anyone's PDS, and your own data is left untouched.

## Commands

| Command                         | What it does                                                  |
| ------------------------------- | ------------------------------------------------------------- |
| `pnpm setup`                    | One-time bootstrap (install, env files, migrate)              |
| `pnpm dev`                      | Run **all** services concurrently (web · ingester · resolver) |
| `pnpm dev:web`                  | Just the Next.js app (for UI work — no firehose/resolver)     |
| `pnpm dev:services`             | Just the ingester + resolver                                  |
| `pnpm db:up` / `pnpm db:down`   | Start / stop the Docker Postgres                              |
| `pnpm db:migrate`               | Apply migrations (defaults to `localhost:5432/onrepeat_test`) |
| `pnpm seed` / `pnpm seed:clean` | Add / remove sample dev data (local index only)               |
| `pnpm test`                     | Unit tests                                                    |
| `pnpm test:int`                 | Integration tests (needs Postgres on :5432)                   |
| `pnpm typecheck`                | Workspace-wide `tsc --noEmit`                                 |

The three services each auto-load their own `apps/<app>/.env.local`; see the matching `.env.example` for the keys.

## Services

| App             | Role                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `apps/web`      | Next.js UI + JSON read API + OAuth login / write actions                                                        |
| `apps/ingester` | Consumes the atproto firehose → indexes `fm.onrepeat.jam` / `like` into Postgres                                |
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
- `pnpm db:up` starts a **Docker** Postgres on `:5432` instead. Don't run both: the second one can't bind the port, and the Docker container is a _separate, empty_ database from Postgres.app.

Pick one. To inspect the app's real data, query the same `:5432` your services use.

## Deployment

Production runs on [Railway](https://railway.app): the three services above plus a managed Postgres, deployed from `main` (the web service runs migrations as its pre-deploy step). Each service builds from the repo root (the pnpm workspace needs the root lockfile) and differs only in its start command.

Configuration is entirely environment variables — see each app's `.env.example` for the full list and the generation commands. The web app additionally needs, in production:

| Variable             | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `OAUTH_MODE=prod`    | Use the hosted confidential client (loopback/dev OAuth is refused) |
| `PUBLIC_URL`         | Public https origin; the OAuth `client_id` is derived from it      |
| `OAUTH_PRIVATE_KEYS` | JSON array of ES256 signing keys (append-only rotation)            |
| `OAUTH_STORE_KEY`    | Encrypts stored OAuth sessions/state at rest                       |
| `SESSION_SECRET`     | Encrypts the session cookie                                        |

A misconfigured production deploy fails closed on OAuth (read-only pages still serve) rather than silently running insecure dev OAuth on a public origin.

## Lexicons

The `fm.onrepeat.*` lexicons are published on the network as `com.atproto.lexicon.schema` records under [`@onrepeat.fm`](https://bsky.app/profile/onrepeat.fm) (`did:plc:uvn6p3pn2vwdjgnerqfrdcx4`), with NSID authority bound via the `_lexicon.onrepeat.fm` DNS TXT record. Source docs live in [`lexicons/`](lexicons/). Schema changes bump a monotonic `revision`; breaking changes get a new NSID.

## Testing

Unit tests run with `pnpm test`.

Integration tests (`pnpm test:int`) need Postgres on `:5432` (`pnpm db:up` or Postgres.app). They **truncate tables**, so they run against a **dedicated `onrepeat_inttest` database** — created automatically on first run and kept separate from the dev/app DB (`onrepeat_test`), which they never touch. Override the target with `DATABASE_URL_INTTEST`; a guard refuses to run if it ever resolves to `onrepeat_test`.
