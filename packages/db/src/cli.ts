import { createDb } from './client'
import { createMigrator } from './migrate'

// Apply all pending migrations. Run via `pnpm db:migrate` (root) or
// `pnpm --filter @onrepeat/db run migrate`. Targets DATABASE_URL, defaulting to
// the local dev/test database (same default the integration tests use).
const DEFAULT_URL = 'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? DEFAULT_URL
  const redacted = url.replace(/:\/\/([^:/?#]+):[^@]*@/, '://$1:***@')
  console.log(`[migrate] applying migrations to ${redacted}`)

  const db = createDb(url)
  const { error, results } = await createMigrator(db).migrateToLatest()
  for (const r of results ?? []) {
    console.log(`[migrate] ${r.status}: ${r.migrationName}`)
  }
  await db.destroy()

  if (error) {
    console.error('[migrate] failed:', error)
    process.exit(1)
  }
  console.log(`[migrate] done (${results?.length ?? 0} migration(s) applied)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
