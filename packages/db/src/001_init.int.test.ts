import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createDb } from './client'
import { createMigrator } from './migrate'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

const db = createDb(url)

describe('001_init migration', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('round-trips an actor row', async () => {
    await db
      .insertInto('actors')
      .values({ did: 'did:plc:test1', handle: 'a.test' })
      .execute()

    const row = await db
      .selectFrom('actors')
      .selectAll()
      .where('did', '=', 'did:plc:test1')
      .executeTakeFirst()

    expect(row?.handle).toBe('a.test')

    await db.deleteFrom('actors').where('did', '=', 'did:plc:test1').execute()
  })

  it('defaults a track to pending resolution with empty refs', async () => {
    await db
      .insertInto('tracks')
      .values({ id: 'isrc:USRC12300001', provider_refs: '{}', resolution_status: 'pending' })
      .execute()

    const row = await db
      .selectFrom('tracks')
      .selectAll()
      .where('id', '=', 'isrc:USRC12300001')
      .executeTakeFirst()

    expect(row?.resolution_status).toBe('pending')
    expect(row?.provider_refs).toEqual({})

    await db.deleteFrom('tracks').where('id', '=', 'isrc:USRC12300001').execute()
  })
})
