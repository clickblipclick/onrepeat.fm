import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDb, createMigrator } from '@onrepeat/db'

import { getLatest, loadJamsByUris } from './read'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

async function insertJam(o: {
  uri: string
  did: string
  createdAt: string
  trackId?: string | null
  title?: string
  viaUri?: string
  viaDid?: string
  artworkUrl?: string
}) {
  await db
    .insertInto('jams')
    .values({
      uri: o.uri,
      cid: 'c',
      author_did: o.did,
      track_id: o.trackId ?? null,
      source_url: 'https://open.spotify.com/track/x',
      source_provider: 'spotify',
      raw_title: o.title ?? 'Raw Title',
      raw_artist: 'Raw Artist',
      raw_artwork_url: o.artworkUrl ?? null,
      caption: null,
      via_uri: o.viaUri ?? null,
      via_did: o.viaDid ?? null,
      created_at: o.createdAt,
    })
    .execute()
}

describe('getLatest', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })
  beforeEach(async () => {
    await db.deleteFrom('likes').execute()
    await db.deleteFrom('jams').execute()
    await db.deleteFrom('tracks').execute()
  })
  afterAll(async () => {
    await db.deleteFrom('likes').execute()
    await db.deleteFrom('jams').execute()
    await db.deleteFrom('tracks').execute()
    await db.destroy()
  })

  it('returns newest-first with resolved track refs, like count, and likedByYou', async () => {
    await db
      .insertInto('tracks')
      .values({
        id: 't1',
        title: 'Canon Title',
        artist: 'Canon Artist',
        artwork_url: 'art.jpg',
        provider_refs: JSON.stringify({
          spotify: { url: 'sp' },
          youtube: { url: 'yt' },
        }),
        resolution_status: 'resolved',
      })
      .execute()
    await insertJam({
      uri: 'at://did:plc:a/fm.onrepeat.feed.jam/1',
      did: 'did:plc:a',
      createdAt: '2026-05-30T00:00:00.000Z',
      trackId: 't1',
    })
    await insertJam({
      uri: 'at://did:plc:b/fm.onrepeat.feed.jam/1',
      did: 'did:plc:b',
      createdAt: '2026-05-30T01:00:00.000Z',
    }) // unresolved, newer
    await db
      .insertInto('likes')
      .values([
        {
          uri: 'at://did:plc:x/fm.onrepeat.feed.like/1',
          author_did: 'did:plc:viewer',
          subject_uri: 'at://did:plc:a/fm.onrepeat.feed.jam/1',
          created_at: '2026-05-30T02:00:00.000Z',
        },
        {
          uri: 'at://did:plc:y/fm.onrepeat.feed.like/1',
          author_did: 'did:plc:z',
          subject_uri: 'at://did:plc:a/fm.onrepeat.feed.jam/1',
          created_at: '2026-05-30T02:00:00.000Z',
        },
      ])
      .execute()

    const page = await getLatest(db, { viewerDid: 'did:plc:viewer', limit: 10 })
    expect(page.jams.map((j) => j.uri)).toEqual([
      'at://did:plc:b/fm.onrepeat.feed.jam/1', // newest first
      'at://did:plc:a/fm.onrepeat.feed.jam/1',
    ])
    const resolved = page.jams.find(
      (j) => j.uri === 'at://did:plc:a/fm.onrepeat.feed.jam/1',
    )!
    expect(resolved.title).toBe('Canon Title') // canonical from track
    expect(resolved.providerRefs).toEqual({
      spotify: { url: 'sp' },
      youtube: { url: 'yt' },
    })
    expect(resolved.likeCount).toBe(2)
    expect(resolved.likedByYou).toBe(true)
    const unresolved = page.jams.find(
      (j) => j.uri === 'at://did:plc:b/fm.onrepeat.feed.jam/1',
    )!
    expect(unresolved.title).toBe('Raw Title') // falls back to raw
    expect(unresolved.providerRefs).toEqual({})
    expect(unresolved.likeCount).toBe(0)
  })

  it('paginates by cursor', async () => {
    for (let i = 0; i < 3; i++) {
      await insertJam({
        uri: `at://did:plc:a/fm.onrepeat.feed.jam/${i}`,
        did: 'did:plc:a',
        createdAt: `2026-05-30T0${i}:00:00.000Z`,
      })
    }
    const first = await getLatest(db, { limit: 2 })
    expect(first.jams).toHaveLength(2)
    expect(first.cursor).toBeTruthy()
    const second = await getLatest(db, { limit: 2, cursor: first.cursor })
    expect(second.jams).toHaveLength(1)
    expect(second.cursor).toBeUndefined()
    const allUris = [...first.jams, ...second.jams].map((j) => j.uri)
    expect(new Set(allUris).size).toBe(3) // no overlap
  })

  it('paginates correctly across timestamps that differ only in sub-millisecond precision', async () => {
    // Same millisecond, different microseconds — node-postgres truncates timestamptz to a
    // millisecond JS Date, so a ms-precision cursor would skip the second row at the boundary.
    await insertJam({
      uri: 'at://did:plc:a/fm.onrepeat.feed.jam/hi',
      did: 'did:plc:a',
      createdAt: '2026-05-30T00:00:00.000789Z',
    })
    await insertJam({
      uri: 'at://did:plc:a/fm.onrepeat.feed.jam/lo',
      did: 'did:plc:a',
      createdAt: '2026-05-30T00:00:00.000456Z',
    })
    const first = await getLatest(db, { limit: 1 })
    expect(first.jams.map((j) => j.uri)).toEqual([
      'at://did:plc:a/fm.onrepeat.feed.jam/hi', // newer microsecond first
    ])
    expect(first.cursor).toBeTruthy()
    const second = await getLatest(db, { limit: 1, cursor: first.cursor })
    expect(second.jams.map((j) => j.uri)).toEqual([
      'at://did:plc:a/fm.onrepeat.feed.jam/lo', // not skipped
    ])
    const all = [...first.jams, ...second.jams].map((j) => j.uri)
    expect(new Set(all).size).toBe(2) // no skip, no duplicate
  })

  it('artworkUrl falls back to the jam raw_artwork_url, and a resolved track overrides it', async () => {
    await db
      .insertInto('tracks')
      .values({
        id: 't1',
        title: 'C',
        artist: 'C',
        artwork_url: 'track-art.jpg',
        provider_refs: JSON.stringify({}),
        resolution_status: 'resolved',
      })
      .execute()
    await insertJam({
      uri: 'at://did:plc:a/fm.onrepeat.feed.jam/r',
      did: 'did:plc:a',
      createdAt: '2026-06-01T00:00:00.000Z',
      trackId: 't1',
      artworkUrl: 'raw-art.jpg',
    })
    await insertJam({
      uri: 'at://did:plc:b/fm.onrepeat.feed.jam/r',
      did: 'did:plc:b',
      createdAt: '2026-06-01T01:00:00.000Z',
      artworkUrl: 'raw-art.jpg',
    })
    const page = await getLatest(db, { limit: 10 })
    expect(page.jams.find((j) => j.uri.includes('did:plc:b'))!.artworkUrl).toBe(
      'raw-art.jpg',
    )
    expect(page.jams.find((j) => j.uri.includes('did:plc:a'))!.artworkUrl).toBe(
      'track-art.jpg',
    )
    // resolved track with null artwork_url → falls through to jam's raw_artwork_url
    await db
      .insertInto('tracks')
      .values({
        id: 't2',
        title: 'C',
        artist: 'C',
        artwork_url: null,
        provider_refs: JSON.stringify({}),
        resolution_status: 'resolved',
      })
      .execute()
    await insertJam({
      uri: 'at://did:plc:c/fm.onrepeat.feed.jam/r',
      did: 'did:plc:c',
      createdAt: '2026-06-01T02:00:00.000Z',
      trackId: 't2',
      artworkUrl: 'raw-art.jpg',
    })
    const page2 = await getLatest(db, { limit: 10 })
    expect(
      page2.jams.find((j) => j.uri.includes('did:plc:c'))!.artworkUrl,
    ).toBe('raw-art.jpg') // resolved but track art null → falls to raw
  })

  it('hides jams and likes from actors whose account is not active', async () => {
    await insertJam({
      uri: 'at://did:plc:gone/fm.onrepeat.feed.jam/r1',
      did: 'did:plc:gone',
      createdAt: '2026-06-01T00:00:00.000Z',
    })
    await insertJam({
      uri: 'at://did:plc:here/fm.onrepeat.feed.jam/r1',
      did: 'did:plc:here',
      createdAt: '2026-06-01T01:00:00.000Z',
    })
    // The deactivated actor also liked the active actor's jam.
    await db
      .insertInto('likes')
      .values({
        uri: 'at://did:plc:gone/fm.onrepeat.feed.like/r1',
        author_did: 'did:plc:gone',
        subject_uri: 'at://did:plc:here/fm.onrepeat.feed.jam/r1',
        created_at: '2026-06-01T01:30:00.000Z',
      })
      .execute()
    await db
      .insertInto('actors')
      .values({ did: 'did:plc:gone', status: 'deactivated' })
      .execute()

    const page = await getLatest(db, { limit: 10 })
    expect(page.jams.map((j) => j.authorDid)).toEqual(['did:plc:here'])
    expect(page.jams[0]!.likeCount).toBe(0) // deactivated liker not counted

    // Reactivation makes everything visible again — nothing was deleted.
    await db
      .updateTable('actors')
      .set({ status: 'active' })
      .where('did', '=', 'did:plc:gone')
      .execute()
    const after = await getLatest(db, { limit: 10 })
    expect(after.jams).toHaveLength(2)
    expect(
      after.jams.find((j) => j.authorDid === 'did:plc:here')!.likeCount,
    ).toBe(1)
  })

  it('prefers cdn_artwork_url over the provider artwork_url', async () => {
    await db
      .insertInto('tracks')
      .values({
        id: 'ta:cdn|test',
        title: 'T',
        artist: 'A',
        artwork_url: 'https://provider.example/a.jpg',
        cdn_artwork_url: 'https://cdn.test/art/abc.jpg',
        provider_refs: JSON.stringify({}),
        resolution_status: 'resolved',
      })
      .execute()
    const uri = 'at://did:plc:cdntest/fm.onrepeat.feed.jam/1'
    await insertJam({
      uri,
      did: 'did:plc:cdntest',
      createdAt: '2026-06-01T00:00:00.000Z',
      trackId: 'ta:cdn|test',
      artworkUrl: 'https://provider.example/raw.jpg',
    })

    const [jam] = await loadJamsByUris(db, [uri])
    expect(jam?.artworkUrl).toBe('https://cdn.test/art/abc.jpg')
  })
})
