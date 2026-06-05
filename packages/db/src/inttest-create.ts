// Create the dedicated integration-test database if it doesn't exist yet, then exit.
// Run as a pre-step before the integration suite (see root `test:int` script); kept a
// standalone CLI so it executes inside @onrepeat/db where kysely/pg resolve. The matching
// per-file guard/redirect lives in inttest-setup.ts. Never targets the dev/app DB.
import { sql } from 'kysely'
import { createDb } from './client'

const DEFAULT_INTTEST_DB =
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_inttest'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_INTTEST ?? DEFAULT_INTTEST_DB
  const u = new URL(url)
  const name = u.pathname.replace(/^\//, '')
  if (!name || name === 'onrepeat_test' || !/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(
      `[inttest] refusing to use '${name || url}' as the integration database.`,
    )
  }

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
