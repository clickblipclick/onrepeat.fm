/**
 * Fully-local, ephemeral atproto network for end-to-end testing of onrepeat
 * (post / like / re-jam / delete → ingester → resolver → local Postgres) WITHOUT
 * writing any record to the public network.
 *
 * Boots @atproto/dev-env's PLC (:2582) + PDS (:2583, with its built-in OAuth
 * provider + firehose), creates ONE fresh dev account, wipes derived Postgres
 * state so each run starts clean (the PDS itself is ephemeral — a new DID per
 * run), prints the credentials + the env the other processes need, and stays
 * alive until Ctrl-C.
 *
 * Run via `pnpm dev:pds` (alone) or as part of `pnpm dev:local`.
 */
import { TestNetworkNoAppView } from '@atproto/dev-env'
import { createDb } from '@onrepeat/db'
import { sql } from 'kysely'

const PLC_PORT = 2582
const PDS_PORT = 2583
// NB: the dev-env PDS reserves a list of front labels (incl. `dev`), so the
// default handle must avoid them — `alice.test` is the value the repo's
// integration tests already create successfully.
const HANDLE = process.env.DEV_PDS_HANDLE ?? 'alice.test'
const PASSWORD = process.env.DEV_PDS_PASSWORD ?? 'devpassword'
const EMAIL = 'dev@test.local'
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

// Tables holding derived state that must be reset to match the recreated PDS.
// (Schema/migrations are left intact — we TRUNCATE, never drop.)
const DERIVED_TABLES = [
  'jams',
  'likes',
  'actors',
  'tracks',
  'subscription_state',
  'oauth_session',
  'oauth_state',
]

async function wipeDerivedState(): Promise<void> {
  const db = createDb(DATABASE_URL)
  try {
    await sql`TRUNCATE TABLE ${sql.join(
      DERIVED_TABLES.map((t) => sql.ref(t)),
    )} RESTART IDENTITY CASCADE`.execute(db)
    // pg-boss owns its own `pgboss` schema and may not exist until the resolver
    // has run once. Clear pending jobs best-effort so stale resolves don't run
    // against truncated rows.
    await sql`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'pgboss' AND table_name = 'job') THEN
        EXECUTE 'TRUNCATE TABLE pgboss.job';
      END IF;
    END $$;`.execute(db)
    console.log(
      '🧹 wiped derived Postgres state (jams/likes/actors/tracks/cursor/oauth/jobs)',
    )
  } finally {
    await db.destroy()
  }
}

async function main(): Promise<void> {
  console.log('▸ Booting local ephemeral atproto network (dev-env)…')
  const net = await TestNetworkNoAppView.create({
    plc: { port: PLC_PORT },
    pds: { port: PDS_PORT },
  })

  const agent = net.pds.getAgent()
  const account = await agent.createAccount({
    handle: HANDLE,
    email: EMAIL,
    password: PASSWORD,
  })
  // Some dev-env versions don't leave the agent logged in after createAccount.
  if (!agent.session) {
    await agent.login({ identifier: HANDLE, password: PASSWORD })
  }

  await wipeDerivedState()

  /* eslint-disable no-console */
  console.log(`
✅ Local atproto network ready (ephemeral — data is gone on exit)

   PDS   ${net.pds.url}
   PLC   ${net.plc.url}
   DID   ${account.data.did}

   Sign in at http://127.0.0.1:3000/login with:
     handle:   ${HANDLE}
     password: ${PASSWORD}

   Other processes need (pnpm dev:local sets these for you):
     RELAY_URL=ws://localhost:${PDS_PORT}
     INGESTER_LIVE_TAIL=1
     PLC_DIRECTORY_URL=${net.plc.url}
     DEV_PDS_URL=${net.pds.url}
     DEV_PLC_URL=${net.plc.url}

   Press Ctrl-C to tear everything down.
`)
  /* eslint-enable no-console */

  let closing = false
  const shutdown = async () => {
    if (closing) return
    closing = true
    console.log('\n▸ Tearing down local network…')
    try {
      await net.close()
    } catch (err) {
      console.error('[dev-pds] error during shutdown', err)
    }
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[dev-pds] fatal', err)
  process.exit(1)
})
