import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import { JAM_NSID, LIKE_NSID, PROFILE_NSID } from '@onrepeat/lexicons'
import { handleIngestEvent } from './indexer'
import type { IngestEvent, RecordIngestEvent } from './events'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

const db = createDb(url)

function jamEvent(over: Partial<RecordIngestEvent> = {}): RecordIngestEvent {
  return {
    action: 'create',
    uri: 'at://did:plc:author/fm.onrepeat.jam/1',
    cid: 'bafyjam1',
    did: 'did:plc:author',
    collection: JAM_NSID,
    record: {
      $type: JAM_NSID,
      sourceUrl: 'https://open.spotify.com/track/1',
      sourceProvider: 'spotify',
      title: 'Song',
      artist: 'Artist',
      createdAt: '2026-05-30T00:00:00.000Z',
    },
    seq: 1,
    ...over,
  }
}

function likeEvent(over: Partial<RecordIngestEvent> = {}): RecordIngestEvent {
  return {
    action: 'create',
    uri: 'at://did:plc:author/fm.onrepeat.like/1',
    cid: 'bafylike1',
    did: 'did:plc:author',
    collection: LIKE_NSID,
    record: {
      $type: LIKE_NSID,
      subject: {
        uri: 'at://did:plc:other/fm.onrepeat.jam/1',
        cid: 'bafyreigh2akiscaildchfkqfxldtxpf2aai3bvgqjt52ow2bfzjlf75vna',
      },
      createdAt: '2026-05-30T00:00:00.000Z',
    },
    seq: 1,
    ...over,
  }
}

function profileEvent(
  over: Partial<RecordIngestEvent> = {},
): RecordIngestEvent {
  return {
    action: 'create',
    uri: 'at://did:plc:author/fm.onrepeat.profile/self',
    cid: 'bafyprofile1',
    did: 'did:plc:author',
    collection: PROFILE_NSID,
    record: {
      $type: PROFILE_NSID,
      colorTheme: 'plum',
      createdAt: '2026-05-30T00:00:00.000Z',
    },
    seq: 1,
    ...over,
  }
}

describe('handleIngestEvent', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })

  beforeEach(async () => {
    await db.deleteFrom('jams').execute()
    await db.deleteFrom('likes').execute()
    await db.deleteFrom('actors').execute()
  })

  afterAll(async () => {
    await db.deleteFrom('jams').execute()
    await db.deleteFrom('likes').execute()
    await db.deleteFrom('actors').execute()
    await db.destroy()
  })

  it('indexes a jam create with track_id null and records the actor', async () => {
    await handleIngestEvent(db, jamEvent())

    const jam = await db
      .selectFrom('jams')
      .selectAll()
      .where('uri', '=', jamEvent().uri)
      .executeTakeFirst()
    expect(jam?.track_id).toBeNull()
    expect(jam?.raw_title).toBe('Song')
    expect(jam?.source_provider).toBe('spotify')

    const actor = await db
      .selectFrom('actors')
      .selectAll()
      .where('did', '=', 'did:plc:author')
      .executeTakeFirst()
    expect(actor?.did).toBe('did:plc:author')
    expect(actor?.last_seen).not.toBeNull()
  })

  it('is idempotent on at-uri (apply same create twice → one row)', async () => {
    await handleIngestEvent(db, jamEvent())
    await handleIngestEvent(db, jamEvent())
    const rows = await db
      .selectFrom('jams')
      .selectAll()
      .where('uri', '=', jamEvent().uri)
      .execute()
    expect(rows).toHaveLength(1)
  })

  it('applies an update by replacing fields', async () => {
    await handleIngestEvent(db, jamEvent())
    await handleIngestEvent(
      db,
      jamEvent({
        action: 'update',
        cid: 'bafyjam2',
        record: {
          $type: JAM_NSID,
          sourceUrl: 'https://open.spotify.com/track/1',
          sourceProvider: 'spotify',
          title: 'Song (Remastered)',
          artist: 'Artist',
          createdAt: '2026-05-30T00:00:00.000Z',
        },
      }),
    )
    const jam = await db
      .selectFrom('jams')
      .selectAll()
      .where('uri', '=', jamEvent().uri)
      .executeTakeFirst()
    expect(jam?.raw_title).toBe('Song (Remastered)')
    expect(jam?.cid).toBe('bafyjam2')
  })

  it('removes a row on delete', async () => {
    await handleIngestEvent(db, jamEvent())
    await handleIngestEvent(
      db,
      jamEvent({ action: 'delete', cid: null, record: undefined }),
    )
    const rows = await db
      .selectFrom('jams')
      .selectAll()
      .where('uri', '=', jamEvent().uri)
      .execute()
    expect(rows).toHaveLength(0)
  })

  it('skips a record that fails lexicon validation', async () => {
    await handleIngestEvent(
      db,
      jamEvent({
        record: {
          $type: JAM_NSID,
          // missing required sourceUrl
          sourceProvider: 'spotify',
          title: 'Song',
          artist: 'Artist',
          createdAt: '2026-05-30T00:00:00.000Z',
        },
      }),
    )
    const rows = await db.selectFrom('jams').selectAll().execute()
    expect(rows).toHaveLength(0)
  })

  it('indexes a like create', async () => {
    await handleIngestEvent(db, likeEvent())
    const like = await db
      .selectFrom('likes')
      .selectAll()
      .where('uri', '=', likeEvent().uri)
      .executeTakeFirst()
    expect(like?.subject_uri).toBe('at://did:plc:other/fm.onrepeat.jam/1')
  })

  it('fires onJamIndexed for jam create and update, but not for likes', async () => {
    const seen: string[] = []
    const hooks = {
      onJamIndexed: async (e: IngestEvent) => {
        seen.push(e.action)
      },
    }
    await handleIngestEvent(db, jamEvent(), hooks) // create
    await handleIngestEvent(
      db,
      jamEvent({ action: 'update', cid: 'bafyjam2' }),
      hooks,
    ) // update
    await handleIngestEvent(db, likeEvent(), hooks) // like → must not fire
    expect(seen).toEqual(['create', 'update'])
  })

  it('indexes a profile theme onto the actor (create + update), clears on delete', async () => {
    await handleIngestEvent(db, profileEvent())
    let actor = await db
      .selectFrom('actors')
      .selectAll()
      .where('did', '=', 'did:plc:author')
      .executeTakeFirst()
    expect(actor?.color_theme).toBe('plum')

    await handleIngestEvent(
      db,
      profileEvent({
        action: 'update',
        cid: 'bafyprofile2',
        record: {
          $type: PROFILE_NSID,
          colorTheme: 'teal',
          createdAt: '2026-05-30T00:00:00.000Z',
        },
      }),
    )
    actor = await db
      .selectFrom('actors')
      .selectAll()
      .where('did', '=', 'did:plc:author')
      .executeTakeFirst()
    expect(actor?.color_theme).toBe('teal')

    await handleIngestEvent(
      db,
      profileEvent({ action: 'delete', cid: null, record: undefined }),
    )
    actor = await db
      .selectFrom('actors')
      .selectAll()
      .where('did', '=', 'did:plc:author')
      .executeTakeFirst()
    expect(actor?.color_theme).toBeNull()
  })

  it('preserves resolver-owned track_id across an update', async () => {
    await handleIngestEvent(db, jamEvent())
    // Simulate Plan 4 having resolved the track.
    await db
      .updateTable('jams')
      .set({ track_id: 'track-123' })
      .where('uri', '=', jamEvent().uri)
      .execute()
    await handleIngestEvent(
      db,
      jamEvent({
        action: 'update',
        cid: 'bafyjam2',
        record: {
          $type: JAM_NSID,
          sourceUrl: 'https://open.spotify.com/track/1',
          sourceProvider: 'spotify',
          title: 'Edited',
          artist: 'Artist',
          createdAt: '2026-05-30T00:00:00.000Z',
        },
      }),
    )
    const jam = await db
      .selectFrom('jams')
      .selectAll()
      .where('uri', '=', jamEvent().uri)
      .executeTakeFirst()
    expect(jam?.track_id).toBe('track-123') // untouched by the ingester
    expect(jam?.raw_title).toBe('Edited')
  })

  it('mirrors account status onto a known actor, and back to active', async () => {
    await handleIngestEvent(db, jamEvent()) // creates the actor row
    await handleIngestEvent(db, {
      action: 'account',
      did: 'did:plc:author',
      status: 'deactivated',
      seq: 2,
    })
    let actor = await db
      .selectFrom('actors')
      .selectAll()
      .where('did', '=', 'did:plc:author')
      .executeTakeFirst()
    expect(actor?.status).toBe('deactivated')

    await handleIngestEvent(db, {
      action: 'account',
      did: 'did:plc:author',
      status: 'active',
      seq: 3,
    })
    actor = await db
      .selectFrom('actors')
      .selectAll()
      .where('did', '=', 'did:plc:author')
      .executeTakeFirst()
    expect(actor?.status).toBe('active')
  })

  it('does not create actor rows for account events of unknown DIDs', async () => {
    await handleIngestEvent(db, {
      action: 'account',
      did: 'did:plc:stranger',
      status: 'deactivated',
      seq: 1,
    })
    const rows = await db.selectFrom('actors').selectAll().execute()
    expect(rows).toHaveLength(0)
  })

  it('purges all of an actor’s content on account deletion', async () => {
    await handleIngestEvent(db, jamEvent())
    await handleIngestEvent(db, likeEvent()) // author's like on someone else's jam
    // Someone else's like on the author's jam — its subject dies with the repo.
    await handleIngestEvent(
      db,
      likeEvent({
        uri: 'at://did:plc:fan/fm.onrepeat.like/1',
        did: 'did:plc:fan',
        record: {
          $type: LIKE_NSID,
          subject: { uri: jamEvent().uri, cid: 'bafyjam1' },
          createdAt: '2026-05-30T00:00:00.000Z',
        },
      }),
    )

    await handleIngestEvent(db, {
      action: 'account',
      did: 'did:plc:author',
      status: 'deleted',
      seq: 9,
    })

    expect(await db.selectFrom('jams').selectAll().execute()).toHaveLength(0)
    expect(await db.selectFrom('likes').selectAll().execute()).toHaveLength(0)
    const actor = await db
      .selectFrom('actors')
      .selectAll()
      .where('did', '=', 'did:plc:author')
      .executeTakeFirst()
    expect(actor?.status).toBe('deleted')
  })
})
