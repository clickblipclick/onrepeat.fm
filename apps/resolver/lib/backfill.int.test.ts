import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import { createBoss, createResolveQueue, RESOLVE_QUEUE } from '@onrepeat/jobs'
import { backfill } from './backfill'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)
const boss = createBoss(url)

describe('backfill', () => {
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

  it('links and enqueues jams that have no track_id; skips already-linked', async () => {
    await db
      .insertInto('jams')
      .values([
        {
          uri: 'at://did:plc:a/fm.onrepeat.jam/1',
          cid: 'c1',
          author_did: 'did:plc:a',
          source_url: 'https://open.spotify.com/track/1',
          source_provider: 'spotify',
          raw_title: 'A',
          raw_artist: 'B',
          created_at: '2026-05-30T00:00:00.000Z',
        },
        {
          uri: 'at://did:plc:a/fm.onrepeat.jam/2',
          cid: 'c2',
          author_did: 'did:plc:a',
          source_url: 'https://open.spotify.com/track/2',
          source_provider: 'spotify',
          raw_title: 'C',
          raw_artist: 'D',
          created_at: '2026-05-30T00:00:00.000Z',
          track_id: 'isrc:ALREADY',
        },
      ])
      .execute()

    const count = await backfill(db, boss)
    expect(count).toBe(1) // only the null-track_id jam

    const j1 = await db
      .selectFrom('jams')
      .select('track_id')
      .where('uri', '=', 'at://did:plc:a/fm.onrepeat.jam/1')
      .executeTakeFirst()
    expect(j1?.track_id).toBe('ta:b|a') // identity from raw_artist|raw_title (no isrc)
  })

  it('re-enqueues already-resolved/failed tracks so they pick up new cross-links', async () => {
    await db
      .insertInto('tracks')
      .values({
        id: 'ta:b|a',
        title: 'A',
        artist: 'B',
        resolution_status: 'resolved',
      })
      .execute()
    await db
      .insertInto('jams')
      .values({
        uri: 'at://did:plc:a/fm.onrepeat.jam/3',
        cid: 'c3',
        author_did: 'did:plc:a',
        source_url: 'https://open.spotify.com/track/3',
        source_provider: 'spotify',
        raw_title: 'A',
        raw_artist: 'B',
        created_at: '2026-05-30T00:00:00.000Z',
        track_id: 'ta:b|a',
      })
      .execute()

    const count = await backfill(db, boss)
    expect(count).toBe(1) // the linked jam is not "unlinked"; the resolved track is re-enqueued
  })

  it('re-enqueues self_contained (Bandcamp) tracks so they re-scrape the embed id', async () => {
    await db
      .insertInto('tracks')
      .values({
        id: 'ta:bc|s',
        title: 'S',
        artist: 'A',
        resolution_status: 'self_contained',
      })
      .execute()
    await db
      .insertInto('jams')
      .values({
        uri: 'at://did:plc:a/fm.onrepeat.jam/9',
        cid: 'c9',
        author_did: 'did:plc:a',
        source_url: 'https://x.bandcamp.com/track/y',
        source_provider: 'bandcamp',
        raw_title: 'S',
        raw_artist: 'A',
        created_at: '2026-05-30T00:00:00.000Z',
        track_id: 'ta:bc|s',
      })
      .execute()
    const count = await backfill(db, boss)
    expect(count).toBe(1)
  })
})
