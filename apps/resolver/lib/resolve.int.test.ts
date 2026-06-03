import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import type { ResolveJob } from '@onrepeat/jobs'
import type { ResolveDeps } from '@onrepeat/music'
import { resolveJob } from './resolve'

const url = process.env.DATABASE_URL ?? 'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

const spTrack = {
  id: 'sp1', url: 'https://open.spotify.com/track/sp1', isrc: 'USX', title: 'Canonical Title',
  artist: 'Canonical Artist', durationMs: 200000, artworkUrl: 'https://img/a.jpg',
}
const okDeps: ResolveDeps = {
  spotify: { async searchTrack() { return [spTrack] }, async lookupTrack() { return spTrack } },
  youtube: {
    async searchVideo() { return [{ videoId: 'yt1', url: 'https://www.youtube.com/watch?v=yt1', title: 'Canonical Artist - Canonical Title', channelTitle: 'Chan' }] },
    async lookupDurations() { return new Map([['yt1', 201]]) },
  },
}

async function seedPending(id: string, title = 'Canonical Title', artist = 'Canonical Artist') {
  await db.insertInto('tracks').values({ id, title, artist, resolution_status: 'pending' }).execute()
}

describe('resolveJob', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })
  beforeEach(async () => { await db.deleteFrom('tracks').execute() })
  afterAll(async () => { await db.deleteFrom('tracks').execute(); await db.destroy() })

  it('resolves a cross-resolvable track: source + spotify + youtube refs, isrc, canonical metadata', async () => {
    await seedPending('ta:frank|thinkin')
    const job: ResolveJob = { identity: 'ta:frank|thinkin', sourceUrl: 'https://music.apple.com/us/album/t/1?i=2', provider: 'applemusic' }
    await resolveJob(db, okDeps, job)
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'ta:frank|thinkin').executeTakeFirst()
    expect(t?.resolution_status).toBe('resolved')
    expect(t?.isrc).toBe('USX')
    expect(t?.title).toBe('Canonical Title')
    expect(t?.provider_refs).toEqual({
      applemusic: { url: 'https://music.apple.com/us/album/t/1?i=2' },
      spotify: { url: 'https://open.spotify.com/track/sp1' },
      youtube: { url: 'https://www.youtube.com/watch?v=yt1' },
    })
    expect(t?.resolved_at).not.toBeNull()
  })

  it('marks a Bandcamp (self-contained) track without calling any client', async () => {
    await seedPending('ta:band|song')
    const job: ResolveJob = { identity: 'ta:band|song', sourceUrl: 'https://artist.bandcamp.com/track/x', provider: 'bandcamp' }
    const throwing: ResolveDeps = {
      spotify: { async searchTrack() { throw new Error('no') }, async lookupTrack() { throw new Error('no') } },
      youtube: { async searchVideo() { throw new Error('no') }, async lookupDurations() { throw new Error('no') } },
    }
    await resolveJob(db, throwing, job)
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'ta:band|song').executeTakeFirst()
    expect(t?.resolution_status).toBe('self_contained')
    expect(t?.provider_refs).toEqual({ bandcamp: { url: 'https://artist.bandcamp.com/track/x' } })
  })

  it('resolves with only the source ref when no cross-links match (still resolved, not failed)', async () => {
    await seedPending('ta:obscure|track')
    const job: ResolveJob = { identity: 'ta:obscure|track', sourceUrl: 'https://music.apple.com/us/album/t/9?i=9', provider: 'applemusic' }
    const emptyDeps: ResolveDeps = {
      spotify: { async searchTrack() { return [] }, async lookupTrack() { return null } },
      youtube: { async searchVideo() { return [] }, async lookupDurations() { return new Map() } },
    }
    await resolveJob(db, emptyDeps, job)
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'ta:obscure|track').executeTakeFirst()
    expect(t?.resolution_status).toBe('resolved')
    expect(t?.provider_refs).toEqual({ applemusic: { url: 'https://music.apple.com/us/album/t/9?i=9' } })
  })
})
