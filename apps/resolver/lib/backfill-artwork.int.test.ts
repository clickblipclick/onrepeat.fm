import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDb, createMigrator } from '@onrepeat/db'
import type { ArtworkStore } from '@onrepeat/storage'

import { backfillArtwork } from './backfill-artwork'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

// Placeholder store; the test injects the persist fn directly via backfillArtwork's `persist` opt.
const noopStore: ArtworkStore = {
  has: async () => false,
  put: async () => {},
  urlForKey: (k) => `https://cdn.test/${k}`,
}

describe('backfillArtwork', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })
  beforeEach(async () => {
    await db.deleteFrom('tracks').execute()
  })
  afterAll(async () => {
    await db.destroy()
  })

  it('persists art only for rows missing a cdn url and updates them', async () => {
    await db
      .insertInto('tracks')
      .values([
        {
          id: 't:needs',
          artwork_url: 'https://mzstatic.com/a.jpg',
          resolution_status: 'resolved',
        },
        {
          id: 't:done',
          artwork_url: 'https://mzstatic.com/b.jpg',
          cdn_artwork_url: 'https://cdn.test/already.jpg',
          resolution_status: 'resolved',
        },
        { id: 't:noart', resolution_status: 'failed' },
      ])
      .execute()

    const n = await backfillArtwork(db, noopStore, {
      persist: async (u) => `https://cdn.test/from/${encodeURIComponent(u)}`,
    })

    expect(n).toBe(1)
    const needs = await db
      .selectFrom('tracks')
      .select('cdn_artwork_url')
      .where('id', '=', 't:needs')
      .executeTakeFirst()
    expect(needs?.cdn_artwork_url).toBe(
      'https://cdn.test/from/https%3A%2F%2Fmzstatic.com%2Fa.jpg',
    )
    const done = await db
      .selectFrom('tracks')
      .select('cdn_artwork_url')
      .where('id', '=', 't:done')
      .executeTakeFirst()
    expect(done?.cdn_artwork_url).toBe('https://cdn.test/already.jpg')
  })
})
