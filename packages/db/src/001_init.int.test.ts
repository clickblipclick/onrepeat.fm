import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb } from './client'
import { createMigrator } from './migrate'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

const db = createDb(url)

describe('001_init migration', () => {
  beforeAll(async () => {
    await sql`drop schema public cascade`.execute(db)
    await sql`create schema public`.execute(db)
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('defaults a track to pending resolution with empty refs', async () => {
    await db.insertInto('tracks').values({ id: 'isrc:USRC12300001' }).execute()

    const row = await db
      .selectFrom('tracks')
      .selectAll()
      .where('id', '=', 'isrc:USRC12300001')
      .executeTakeFirst()

    expect(row?.resolution_status).toBe('pending')
    expect(row?.provider_refs).toEqual({})

    await db
      .deleteFrom('tracks')
      .where('id', '=', 'isrc:USRC12300001')
      .execute()
  })

  it('rejects an invalid resolution_status (CHECK constraint)', async () => {
    await expect(
      sql`insert into tracks (id, resolution_status) values ('isrc:BAD', 'bogus')`.execute(
        db,
      ),
    ).rejects.toThrow()
  })
})
