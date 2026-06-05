import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'kysely'
import { createDb } from './client'
import { createMigrator } from './migrate'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

const db = createDb(url)

describe('003_subscription_state migration', () => {
  beforeAll(async () => {
    await sql`drop schema if exists public cascade`.execute(db)
    await sql`create schema public`.execute(db)
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('round-trips a subscription_state row and upserts the cursor', async () => {
    await db
      .insertInto('subscription_state')
      .values({ service: 'firehose', cursor: 100 })
      .execute()

    let row = await db
      .selectFrom('subscription_state')
      .selectAll()
      .where('service', '=', 'firehose')
      .executeTakeFirst()
    expect(Number(row?.cursor)).toBe(100)

    await db
      .insertInto('subscription_state')
      .values({ service: 'firehose', cursor: 250 })
      .onConflict((oc) => oc.column('service').doUpdateSet({ cursor: 250 }))
      .execute()

    row = await db
      .selectFrom('subscription_state')
      .selectAll()
      .where('service', '=', 'firehose')
      .executeTakeFirst()
    expect(Number(row?.cursor)).toBe(250)

    await db
      .deleteFrom('subscription_state')
      .where('service', '=', 'firehose')
      .execute()
  })
})
