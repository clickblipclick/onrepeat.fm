import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { JAM_NSID, LIKE_NSID } from '@onrepeat/lexicons'

import { createDb } from './client'
import {
  indexJam,
  indexLike,
  markTrackFailed,
  removeJam,
  removeLike,
  upsertActorProfiles,
} from './index-write'
import { createMigrator } from './migrate'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

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
  beforeEach(async () => {
    await db.deleteFrom('jams').where('uri', '=', TEST_URI).execute()
  })

  afterAll(async () => {
    await db.deleteFrom('jams').where('uri', '=', TEST_URI).execute()
  })

  it('inserts a jam row retrievable by uri with all mapped columns', async () => {
    await indexJam(db, {
      uri: TEST_URI,
      cid: TEST_CID,
      did: TEST_DID,
      record: baseRecord,
    })

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
    expect(row?.raw_artwork_url).toBeNull()
  })

  it('is idempotent and preserves track_id while updating other columns on re-index', async () => {
    // Insert the initial jam
    await indexJam(db, {
      uri: TEST_URI,
      cid: TEST_CID,
      did: TEST_DID,
      record: baseRecord,
    })

    // Simulate resolver linking the jam to a track
    await db
      .updateTable('jams')
      .set({ track_id: 't1' })
      .where('uri', '=', TEST_URI)
      .execute()

    // Re-index with changed caption
    const updatedRecord = { ...baseRecord, caption: 'updated caption' }
    await indexJam(db, {
      uri: TEST_URI,
      cid: TEST_CID,
      did: TEST_DID,
      record: updatedRecord,
    })

    const row = await db
      .selectFrom('jams')
      .selectAll()
      .where('uri', '=', TEST_URI)
      .executeTakeFirst()

    expect(row?.caption).toBe('updated caption')
    expect(row?.track_id).toBe('t1')
  })

  it('persists and refreshes raw_artwork_url', async () => {
    const uri = 'at://did:plc:a/fm.onrepeat.jam/art'
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
          artworkUrl: 'first.jpg',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      })
      let row = await db
        .selectFrom('jams')
        .select('raw_artwork_url')
        .where('uri', '=', uri)
        .executeTakeFirstOrThrow()
      expect(row.raw_artwork_url).toBe('first.jpg')
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
          artworkUrl: 'second.jpg',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      })
      row = await db
        .selectFrom('jams')
        .select('raw_artwork_url')
        .where('uri', '=', uri)
        .executeTakeFirstOrThrow()
      expect(row.raw_artwork_url).toBe('second.jpg')
    } finally {
      await db.deleteFrom('jams').where('uri', '=', uri).execute()
    }
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

      expect(
        new Date(row.created_at as unknown as string | Date).toISOString(),
      ).toBe(first) // original retained
      expect(row.cid).toBe('c2') // but cid (mutable) did update
    } finally {
      await db.deleteFrom('jams').where('uri', '=', uri).execute()
    }
  })
})

describe('removeJam', () => {
  beforeEach(async () => {
    await db.deleteFrom('jams').where('uri', '=', TEST_URI).execute()
  })

  afterAll(async () => {
    await db.deleteFrom('jams').where('uri', '=', TEST_URI).execute()
  })

  it('deletes an existing jam row by uri', async () => {
    await indexJam(db, {
      uri: TEST_URI,
      cid: TEST_CID,
      did: TEST_DID,
      record: baseRecord,
    })
    await removeJam(db, TEST_URI)
    const row = await db
      .selectFrom('jams')
      .selectAll()
      .where('uri', '=', TEST_URI)
      .executeTakeFirst()
    expect(row).toBeUndefined()
  })

  it('is a no-op when the uri is absent', async () => {
    await expect(removeJam(db, TEST_URI)).resolves.toBeUndefined()
  })
})

const LIKE_URI = 'at://did:plc:liker/fm.onrepeat.like/intlike1'
const LIKE_DID = 'did:plc:liker'

const likeRecord = {
  $type: LIKE_NSID as 'fm.onrepeat.like',
  subject: { uri: TEST_URI, cid: TEST_CID },
  createdAt: '2026-06-10T00:00:00.000Z',
}

describe('indexLike / removeLike', () => {
  beforeEach(async () => {
    await db.deleteFrom('likes').where('uri', '=', LIKE_URI).execute()
  })

  afterAll(async () => {
    await db.deleteFrom('likes').where('uri', '=', LIKE_URI).execute()
  })

  it('inserts a like row retrievable by uri', async () => {
    await indexLike(db, { uri: LIKE_URI, did: LIKE_DID, record: likeRecord })
    const row = await db
      .selectFrom('likes')
      .selectAll()
      .where('uri', '=', LIKE_URI)
      .executeTakeFirst()
    expect(row).toBeDefined()
    expect(row!.author_did).toBe(LIKE_DID)
    expect(row!.subject_uri).toBe(TEST_URI)
  })

  it('re-indexing the same uri is an idempotent upsert', async () => {
    await indexLike(db, { uri: LIKE_URI, did: LIKE_DID, record: likeRecord })
    await indexLike(db, {
      uri: LIKE_URI,
      did: LIKE_DID,
      record: { ...likeRecord, createdAt: '2026-06-11T00:00:00.000Z' },
    })
    const rows = await db
      .selectFrom('likes')
      .selectAll()
      .where('uri', '=', LIKE_URI)
      .execute()
    expect(rows).toHaveLength(1)
  })

  it('removeLike deletes the row and is a no-op when absent', async () => {
    await indexLike(db, { uri: LIKE_URI, did: LIKE_DID, record: likeRecord })
    await removeLike(db, LIKE_URI)
    await removeLike(db, LIKE_URI) // second call must not throw
    const row = await db
      .selectFrom('likes')
      .selectAll()
      .where('uri', '=', LIKE_URI)
      .executeTakeFirst()
    expect(row).toBeUndefined()
  })
})

describe('upsertActorProfiles', () => {
  const A = 'did:plc:profcacheA'
  const B = 'did:plc:profcacheB'

  beforeEach(async () => {
    await db.deleteFrom('actors').where('did', 'in', [A, B]).execute()
  })
  afterAll(async () => {
    await db.deleteFrom('actors').where('did', 'in', [A, B]).execute()
  })

  it('inserts positive and negative (null-profile) rows with the timestamp', async () => {
    const at = new Date('2026-06-22T00:00:00.000Z')
    await upsertActorProfiles(
      db,
      [
        {
          did: A,
          profile: { handle: 'a.test', displayName: 'Ay', avatar: 'av.jpg' },
        },
        { did: B, profile: null },
      ],
      at,
    )
    const rows = await db
      .selectFrom('actors')
      .select(['did', 'handle', 'display_name', 'avatar', 'profile_updated_at'])
      .where('did', 'in', [A, B])
      .execute()
    const byDid = new Map(rows.map((r) => [r.did, r]))
    expect(byDid.get(A)).toMatchObject({
      handle: 'a.test',
      display_name: 'Ay',
      avatar: 'av.jpg',
    })
    expect(byDid.get(A)!.profile_updated_at?.toISOString()).toBe(
      at.toISOString(),
    )
    expect(byDid.get(B)).toMatchObject({
      handle: null,
      display_name: null,
      avatar: null,
    })
    expect(byDid.get(B)!.profile_updated_at?.toISOString()).toBe(
      at.toISOString(),
    )
  })

  it('updates an existing row and preserves color_theme + status', async () => {
    await db
      .insertInto('actors')
      .values({ did: A, color_theme: 'plum', status: 'suspended' })
      .execute()

    await upsertActorProfiles(
      db,
      [{ did: A, profile: { handle: 'new.test', displayName: 'New' } }],
      new Date('2026-06-22T12:00:00.000Z'),
    )

    const row = await db
      .selectFrom('actors')
      .select(['handle', 'display_name', 'avatar', 'color_theme', 'status'])
      .where('did', '=', A)
      .executeTakeFirst()
    expect(row).toMatchObject({
      handle: 'new.test',
      display_name: 'New',
      avatar: null,
      color_theme: 'plum',
      status: 'suspended',
    })
  })

  it('is a no-op on empty input', async () => {
    await upsertActorProfiles(db, [], new Date())
    const count = await db
      .selectFrom('actors')
      .select((eb) => eb.fn.countAll().as('n'))
      .where('did', 'in', [A, B])
      .executeTakeFirst()
    expect(Number(count!.n)).toBe(0)
  })
})

describe('markTrackFailed', () => {
  const ID = 'isrc:INTTESTMTF'

  beforeEach(async () => {
    await db.deleteFrom('tracks').where('id', '=', ID).execute()
  })
  afterAll(async () => {
    await db.deleteFrom('tracks').where('id', '=', ID).execute()
  })

  const statusOf = async () =>
    (
      await db
        .selectFrom('tracks')
        .select('resolution_status')
        .where('id', '=', ID)
        .executeTakeFirst()
    )?.resolution_status

  it('marks a pending track failed', async () => {
    await db
      .insertInto('tracks')
      .values({ id: ID, resolution_status: 'pending' })
      .execute()
    await markTrackFailed(db, ID)
    expect(await statusOf()).toBe('failed')
  })

  it('does NOT clobber a resolved track back to failed (late-failure race)', async () => {
    await db
      .insertInto('tracks')
      .values({ id: ID, resolution_status: 'resolved' })
      .execute()
    await markTrackFailed(db, ID)
    expect(await statusOf()).toBe('resolved')
  })

  it('does NOT clobber a self_contained track', async () => {
    await db
      .insertInto('tracks')
      .values({ id: ID, resolution_status: 'self_contained' })
      .execute()
    await markTrackFailed(db, ID)
    expect(await statusOf()).toBe('self_contained')
  })
})

beforeAll(async () => {
  const { error } = await createMigrator(db).migrateToLatest()
  if (error) throw error
})

afterAll(async () => {
  await db.destroy()
})
