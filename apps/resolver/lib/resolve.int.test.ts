import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import type { ResolveJob } from '@onrepeat/jobs'
import { resolveJob, type ResolverDeps } from './resolve'

const url = process.env.DATABASE_URL ?? 'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

const apple = { title: 'Canonical', artist: 'Artist', artworkUrl: 'https://img/a.jpg', sourceUrl: 'https://music.apple.com/us/album/t/1?i=2', provider: 'applemusic', durationSec: 200 }
const okDeps: ResolverDeps = {
  itunes: { async search() { return [apple] }, async lookup() { return apple } },
  youtube: {
    async searchVideo() { return [{ videoId: 'yt1', url: 'https://www.youtube.com/watch?v=yt1', title: 'Artist - Canonical', channelTitle: 'C' }] },
    async lookupDurations() { return new Map([['yt1', 201]]) },
  },
  bandcamp: async () => ({ trackId: '999' }),
}

async function seedPending(id: string, title = 'Canonical', artist = 'Artist') {
  await db.insertInto('tracks').values({ id, title, artist, resolution_status: 'pending' }).execute()
}

describe('resolveJob (v2)', () => {
  beforeAll(async () => { const { error } = await createMigrator(db).migrateToLatest(); if (error) throw error })
  beforeEach(async () => { await db.deleteFrom('tracks').execute() })
  afterAll(async () => { await db.deleteFrom('tracks').execute(); await db.destroy() })

  it('cross-resolves: source + apple + youtube', async () => {
    await seedPending('ta:a|c')
    await resolveJob(db, okDeps, { identity: 'ta:a|c', sourceUrl: 'https://open.spotify.com/track/sp1', provider: 'spotify' })
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'ta:a|c').executeTakeFirst()
    expect(t?.resolution_status).toBe('resolved')
    expect(t?.provider_refs).toEqual({
      spotify: { url: 'https://open.spotify.com/track/sp1' },
      applemusic: { url: 'https://music.apple.com/us/album/t/1?i=2' },
      youtube: { url: 'https://www.youtube.com/watch?v=yt1' },
    })
  })

  it('bandcamp: self_contained with scraped trackId', async () => {
    await seedPending('ta:b|s')
    await resolveJob(db, okDeps, { identity: 'ta:b|s', sourceUrl: 'https://x.bandcamp.com/track/y', provider: 'bandcamp' })
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'ta:b|s').executeTakeFirst()
    expect(t?.resolution_status).toBe('self_contained')
    expect(t?.provider_refs).toEqual({ bandcamp: { url: 'https://x.bandcamp.com/track/y', trackId: '999' } })
  })

  it('apple-only when no youtube client; still resolved', async () => {
    await seedPending('ta:o|t')
    await resolveJob(db, { itunes: okDeps.itunes }, { identity: 'ta:o|t', sourceUrl: 'https://open.spotify.com/track/z', provider: 'spotify' })
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'ta:o|t').executeTakeFirst()
    expect(t?.resolution_status).toBe('resolved')
    expect(t?.provider_refs).toEqual({ spotify: { url: 'https://open.spotify.com/track/z' }, applemusic: { url: 'https://music.apple.com/us/album/t/1?i=2' } })
  })
})
