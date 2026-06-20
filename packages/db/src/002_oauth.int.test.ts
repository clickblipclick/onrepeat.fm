import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb } from './client'
import { createMigrator } from './migrate'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

const db = createDb(url)

describe('002_oauth migration', () => {
  beforeAll(async () => {
    await sql`drop schema if exists public cascade`.execute(db)
    await sql`create schema public`.execute(db)
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('round-trips an oauth_state row', async () => {
    await db
      .insertInto('oauth_state')
      .values({ key: 'k1', state: '{"a":1}' })
      .execute()
    const row = await db
      .selectFrom('oauth_state')
      .selectAll()
      .where('key', '=', 'k1')
      .executeTakeFirst()
    expect(row?.state).toBe('{"a":1}')
    await db.deleteFrom('oauth_state').where('key', '=', 'k1').execute()
  })

  it('round-trips an oauth_session row', async () => {
    await db
      .insertInto('oauth_session')
      .values({ did: 'did:plc:abc', session: '{"tokens":true}' })
      .execute()
    const row = await db
      .selectFrom('oauth_session')
      .selectAll()
      .where('did', '=', 'did:plc:abc')
      .executeTakeFirst()
    expect(row?.session).toBe('{"tokens":true}')
    await db
      .deleteFrom('oauth_session')
      .where('did', '=', 'did:plc:abc')
      .execute()
  })
})
