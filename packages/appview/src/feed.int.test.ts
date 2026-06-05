import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import { getActorJams, getFollowFeed } from './read'

const url = process.env.DATABASE_URL ?? 'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

async function insertJam(uri: string, did: string, createdAt: string) {
  await db.insertInto('jams').values({
    uri, cid: 'c', author_did: did, track_id: null,
    source_url: 'u', source_provider: 'spotify', raw_title: 'T', raw_artist: 'A',
    caption: null, via_uri: null, via_did: null, created_at: createdAt,
  }).execute()
}
const recent = () => new Date(Date.now() - 60_000).toISOString()
const old = () => new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString() // 10 days ago

describe('getActorJams + getFollowFeed', () => {
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

  it('getActorJams returns the actor jams newest-first (current + archive)', async () => {
    await insertJam('at://did:plc:a/fm.onrepeat.jam/1', 'did:plc:a', '2026-05-29T00:00:00.000Z')
    await insertJam('at://did:plc:a/fm.onrepeat.jam/2', 'did:plc:a', '2026-05-30T00:00:00.000Z')
    await insertJam('at://did:plc:b/fm.onrepeat.jam/1', 'did:plc:b', '2026-05-30T00:00:00.000Z')
    const page = await getActorJams(db, { did: 'did:plc:a', limit: 10 })
    expect(page.jams.map((j) => j.uri)).toEqual([
      'at://did:plc:a/fm.onrepeat.jam/2',
      'at://did:plc:a/fm.onrepeat.jam/1',
    ])
  })

  it('getFollowFeed returns one current jam per followed author, <7 days, newest-first', async () => {
    // author a: an old jam + a recent jam -> only the recent (current) one
    await insertJam('at://did:plc:a/fm.onrepeat.jam/old', 'did:plc:a', old())
    await insertJam('at://did:plc:a/fm.onrepeat.jam/cur', 'did:plc:a', recent())
    // author b: only an expired jam -> excluded (no current jam)
    await insertJam('at://did:plc:b/fm.onrepeat.jam/old', 'did:plc:b', old())
    // author c: a current jam, but NOT followed -> excluded
    await insertJam('at://did:plc:c/fm.onrepeat.jam/cur', 'did:plc:c', recent())

    const page = await getFollowFeed(db, { followedDids: ['did:plc:a', 'did:plc:b'], limit: 10 })
    expect(page.jams.map((j) => j.uri)).toEqual(['at://did:plc:a/fm.onrepeat.jam/cur'])
  })

  it('getFollowFeed with no follows returns empty', async () => {
    const page = await getFollowFeed(db, { followedDids: [], limit: 10 })
    expect(page.jams).toEqual([])
    expect(page.cursor).toBeUndefined()
  })

  it('getFollowFeed includes the viewer\'s own current jam, sorted chronologically (no self-follow)', async () => {
    await insertJam('at://did:plc:a/fm.onrepeat.jam/cur', 'did:plc:a', new Date(Date.now() - 2 * 60_000).toISOString())
    await insertJam('at://did:plc:me/fm.onrepeat.jam/cur', 'did:plc:me', new Date(Date.now() - 1 * 60_000).toISOString()) // mine, newest
    const page = await getFollowFeed(db, { followedDids: ['did:plc:a'], viewerDid: 'did:plc:me', limit: 10 })
    expect(page.jams.map((j) => j.uri)).toEqual([
      'at://did:plc:me/fm.onrepeat.jam/cur',
      'at://did:plc:a/fm.onrepeat.jam/cur',
    ])
  })

  it('getFollowFeed shows your own current jam even when you follow nobody', async () => {
    await insertJam('at://did:plc:me/fm.onrepeat.jam/cur', 'did:plc:me', recent())
    const page = await getFollowFeed(db, { followedDids: [], viewerDid: 'did:plc:me', limit: 10 })
    expect(page.jams.map((j) => j.uri)).toEqual(['at://did:plc:me/fm.onrepeat.jam/cur'])
  })

  it('getActorJams paginates by cursor and never leaks other authors', async () => {
    await insertJam('at://did:plc:a/fm.onrepeat.jam/1', 'did:plc:a', '2026-05-29T00:00:00.000Z')
    await insertJam('at://did:plc:a/fm.onrepeat.jam/2', 'did:plc:a', '2026-05-30T00:00:00.000Z')
    await insertJam('at://did:plc:a/fm.onrepeat.jam/3', 'did:plc:a', '2026-05-31T00:00:00.000Z')
    await insertJam('at://did:plc:b/fm.onrepeat.jam/1', 'did:plc:b', '2026-05-31T12:00:00.000Z') // other author, newest overall
    const first = await getActorJams(db, { did: 'did:plc:a', limit: 2 })
    expect(first.jams.map((j) => j.uri)).toEqual([
      'at://did:plc:a/fm.onrepeat.jam/3',
      'at://did:plc:a/fm.onrepeat.jam/2',
    ])
    expect(first.cursor).toBeTruthy()
    const second = await getActorJams(db, { did: 'did:plc:a', limit: 2, cursor: first.cursor })
    expect(second.jams.map((j) => j.uri)).toEqual(['at://did:plc:a/fm.onrepeat.jam/1'])
    expect(second.cursor).toBeUndefined()
    expect([...first.jams, ...second.jams].every((j) => j.authorDid === 'did:plc:a')).toBe(true)
  })

  it('getFollowFeed orders current jams newest-first across authors and paginates', async () => {
    await insertJam('at://did:plc:a/fm.onrepeat.jam/cur', 'did:plc:a', new Date(Date.now() - 3 * 60_000).toISOString())
    await insertJam('at://did:plc:b/fm.onrepeat.jam/cur', 'did:plc:b', new Date(Date.now() - 2 * 60_000).toISOString())
    await insertJam('at://did:plc:c/fm.onrepeat.jam/cur', 'did:plc:c', new Date(Date.now() - 1 * 60_000).toISOString())
    const followed = ['did:plc:a', 'did:plc:b', 'did:plc:c']
    const first = await getFollowFeed(db, { followedDids: followed, limit: 2 })
    expect(first.jams.map((j) => j.uri)).toEqual([
      'at://did:plc:c/fm.onrepeat.jam/cur', // newest
      'at://did:plc:b/fm.onrepeat.jam/cur',
    ])
    expect(first.cursor).toBeTruthy()
    const second = await getFollowFeed(db, { followedDids: followed, limit: 2, cursor: first.cursor })
    expect(second.jams.map((j) => j.uri)).toEqual(['at://did:plc:a/fm.onrepeat.jam/cur'])
    expect(second.cursor).toBeUndefined()
  })
})
