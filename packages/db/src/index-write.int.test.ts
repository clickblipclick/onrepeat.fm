import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { JAM_NSID } from '@onrepeat/lexicons'
import { createDb } from './client'
import { createMigrator } from './migrate'
import { indexJam } from './index-write'

const url =
  process.env.DATABASE_URL ?? 'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

const db = createDb(url)

const TEST_URI = 'at://did:plc:test/fm.onrepeat.jam/inttest1'
const TEST_CID = 'bafytest1'
const TEST_DID = 'did:plc:test'

const baseRecord = {
  $type: JAM_NSID as 'fm.onrepeat.jam',
  sourceUrl: 'https://open.spotify.com/track/inttest',
  sourceProvider: 'spotify',
  title: 'Integration Song',
  artist: 'Integration Artist',
  caption: 'original caption',
  createdAt: '2026-05-30T00:00:00.000Z',
}

describe('indexJam', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })

  beforeEach(async () => {
    await db.deleteFrom('jams').where('uri', '=', TEST_URI).execute()
  })

  afterAll(async () => {
    await db.deleteFrom('jams').where('uri', '=', TEST_URI).execute()
    await db.destroy()
  })

  it('inserts a jam row retrievable by uri with all mapped columns', async () => {
    await indexJam(db, { uri: TEST_URI, cid: TEST_CID, did: TEST_DID, record: baseRecord })

    const row = await db
      .selectFrom('jams')
      .selectAll()
      .where('uri', '=', TEST_URI)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.uri).toBe(TEST_URI)
    expect(row?.cid).toBe(TEST_CID)
    expect(row?.author_did).toBe(TEST_DID)
    expect(row?.track_id).toBeNull()
    expect(row?.source_url).toBe(baseRecord.sourceUrl)
    expect(row?.source_provider).toBe(baseRecord.sourceProvider)
    expect(row?.raw_title).toBe(baseRecord.title)
    expect(row?.raw_artist).toBe(baseRecord.artist)
    expect(row?.caption).toBe(baseRecord.caption)
    expect(row?.via_uri).toBeNull()
    expect(row?.via_did).toBeNull()
  })

  it('is idempotent and preserves track_id while updating other columns on re-index', async () => {
    // Insert the initial jam
    await indexJam(db, { uri: TEST_URI, cid: TEST_CID, did: TEST_DID, record: baseRecord })

    // Simulate resolver linking the jam to a track
    await db
      .updateTable('jams')
      .set({ track_id: 't1' })
      .where('uri', '=', TEST_URI)
      .execute()

    // Re-index with changed caption
    const updatedRecord = { ...baseRecord, caption: 'updated caption' }
    await indexJam(db, { uri: TEST_URI, cid: TEST_CID, did: TEST_DID, record: updatedRecord })

    const row = await db
      .selectFrom('jams')
      .selectAll()
      .where('uri', '=', TEST_URI)
      .executeTakeFirst()

    expect(row?.caption).toBe('updated caption')
    expect(row?.track_id).toBe('t1')
  })

  it('keeps the original created_at on re-index (immutable)', async () => {
    const uri = 'at://did:plc:a/fm.onrepeat.jam/ts'
    const first = '2026-05-01T00:00:00.000Z'
    const second = '2026-05-30T00:00:00.000Z'

    await db.deleteFrom('jams').where('uri', '=', uri).execute()
    try {
      await indexJam(db, {
        uri,
        cid: 'c1',
        did: 'did:plc:a',
        record: {
          $type: JAM_NSID as 'fm.onrepeat.jam',
          sourceUrl: 'u',
          sourceProvider: 'spotify',
          title: 'T',
          artist: 'A',
          createdAt: first,
        },
      })
      await indexJam(db, {
        uri,
        cid: 'c2',
        did: 'did:plc:a',
        record: {
          $type: JAM_NSID as 'fm.onrepeat.jam',
          sourceUrl: 'u',
          sourceProvider: 'spotify',
          title: 'T',
          artist: 'A',
          createdAt: second,
        },
      })

      const row = await db
        .selectFrom('jams')
        .select(['created_at', 'cid'])
        .where('uri', '=', uri)
        .executeTakeFirstOrThrow()

      expect(new Date(row.created_at as unknown as string | Date).toISOString()).toBe(first) // original retained
      expect(row.cid).toBe('c2') // but cid (mutable) did update
    } finally {
      await db.deleteFrom('jams').where('uri', '=', uri).execute()
    }
  })
})
