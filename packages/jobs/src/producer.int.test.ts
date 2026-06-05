import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import { JAM_NSID, type JamRecord } from '@onrepeat/lexicons'
import { createBoss, createResolveQueue, RESOLVE_QUEUE } from './queue'
import { enqueueResolveForJam } from './producer'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)
const boss = createBoss(url)

function jam(over: Partial<JamRecord> = {}): {
  uri: string
  record: JamRecord
} {
  return {
    uri: 'at://did:plc:author/fm.onrepeat.jam/1',
    record: {
      $type: JAM_NSID,
      sourceUrl: 'https://open.spotify.com/track/1',
      sourceProvider: 'spotify',
      title: 'Song',
      artist: 'Artist',
      isrc: 'USRC12300001',
      createdAt: '2026-05-30T00:00:00.000Z',
      ...over,
    },
  }
}

describe('enqueueResolveForJam', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
    await boss.start()
    await createResolveQueue(boss)
  })
  beforeEach(async () => {
    await boss.deleteAllJobs(RESOLVE_QUEUE)
    await db.deleteFrom('jams').execute()
    await db.deleteFrom('tracks').execute()
  })
  afterAll(async () => {
    await db.deleteFrom('jams').execute()
    await db.deleteFrom('tracks').execute()
    await boss.stop({ graceful: false })
    await db.destroy()
  })

  it('upserts a pending track seeded with metadata, links the jam, and enqueues', async () => {
    await db
      .insertInto('jams')
      .values({
        uri: jam().uri,
        cid: 'bafy',
        author_did: 'did:plc:author',
        source_url: jam().record.sourceUrl,
        source_provider: 'spotify',
        raw_title: 'Song',
        raw_artist: 'Artist',
        created_at: '2026-05-30T00:00:00.000Z',
      })
      .execute()

    await enqueueResolveForJam(boss, db, jam())

    const track = await db
      .selectFrom('tracks')
      .selectAll()
      .where('id', '=', 'isrc:USRC12300001')
      .executeTakeFirst()
    expect(track?.resolution_status).toBe('pending')
    expect(track?.title).toBe('Song')
    expect(track?.isrc).toBe('USRC12300001')

    const linked = await db
      .selectFrom('jams')
      .select('track_id')
      .where('uri', '=', jam().uri)
      .executeTakeFirst()
    expect(linked?.track_id).toBe('isrc:USRC12300001')

    const queued = await boss.fetch(RESOLVE_QUEUE)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.data).toMatchObject({
      identity: 'isrc:USRC12300001',
      provider: 'spotify',
      sourceUrl: 'https://open.spotify.com/track/1',
    })
  })

  it('uses the ta: fallback identity when the jam has no isrc', async () => {
    const noIsrc = jam({ isrc: undefined })
    await db
      .insertInto('jams')
      .values({
        uri: noIsrc.uri,
        cid: 'bafy',
        author_did: 'did:plc:author',
        source_url: noIsrc.record.sourceUrl,
        source_provider: 'spotify',
        raw_title: 'Song',
        raw_artist: 'Artist',
        created_at: '2026-05-30T00:00:00.000Z',
      })
      .execute()

    await enqueueResolveForJam(boss, db, noIsrc)

    const linked = await db
      .selectFrom('jams')
      .select('track_id')
      .where('uri', '=', noIsrc.uri)
      .executeTakeFirst()
    expect(linked?.track_id).toBe('ta:artist|song')
    const track = await db
      .selectFrom('tracks')
      .selectAll()
      .where('id', '=', 'ta:artist|song')
      .executeTakeFirst()
    expect(track?.resolution_status).toBe('pending')
  })

  it('does not re-enqueue or reset a track that is already resolved', async () => {
    await db
      .insertInto('jams')
      .values({
        uri: jam().uri,
        cid: 'bafy',
        author_did: 'did:plc:author',
        source_url: jam().record.sourceUrl,
        source_provider: 'spotify',
        raw_title: 'Song',
        raw_artist: 'Artist',
        created_at: '2026-05-30T00:00:00.000Z',
      })
      .execute()
    await db
      .insertInto('tracks')
      .values({ id: 'isrc:USRC12300001', resolution_status: 'resolved' })
      .execute()

    await enqueueResolveForJam(boss, db, jam())

    const track = await db
      .selectFrom('tracks')
      .selectAll()
      .where('id', '=', 'isrc:USRC12300001')
      .executeTakeFirst()
    expect(track?.resolution_status).toBe('resolved')
    const linked = await db
      .selectFrom('jams')
      .select('track_id')
      .where('uri', '=', jam().uri)
      .executeTakeFirst()
    expect(linked?.track_id).toBe('isrc:USRC12300001')
  })
})
