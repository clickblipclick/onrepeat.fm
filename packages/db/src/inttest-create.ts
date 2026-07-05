// Create the dedicated integration-test database if it doesn't exist yet, then exit.
// Run as a pre-step before the integration suite (see root `test:int` script); kept a
// standalone CLI so it executes inside @onrepeat/db where kysely/pg resolve. The matching
// per-file guard/redirect lives in inttest-setup.ts. Never targets the dev/app DB.
import { sql } from 'kysely'

import { createDb } from './client'
import { assertInttestUrl, resolveInttestUrl } from './inttest-guard'

async function main(): Promise<void> {
  const url = resolveInttestUrl() // safe, local, opted-in *_inttest DB or throws
  const name = assertInttestUrl(url)
  const u = new URL(url)

  // Connect to the maintenance 'postgres' database to create the int DB if missing.
  u.pathname = '/postgres'
  const admin = createDb(u.toString())
  try {
    const existing =
      await sql`select 1 from pg_database where datname = ${name}`.execute(
        admin,
      )
    if (existing.rows.length === 0) {
      await sql.raw(`create database "${name}"`).execute(admin)
      console.log(`[inttest] created database ${name}`)
    } else {
      console.log(`[inttest] using existing database ${name}`)
    }
  } finally {
    await admin.destroy()
  }
}

main().catch((err) => {
  console.error(
    '[inttest] failed to ensure database:',
    err instanceof Error ? err.message : err,
  )
  process.exit(1)
})
