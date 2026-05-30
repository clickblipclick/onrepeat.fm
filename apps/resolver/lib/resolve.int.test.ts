import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import type { ResolveJob } from '@onrepeat/jobs'
import { resolveTrack } from './resolve'
import type { OdesliClient } from './odesli'

const url = process.env.DATABASE_URL ?? 'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

const okClient: OdesliClient = {
  async resolve() {
    return {
      notFound: false,
      title: 'Canonical Title',
      artist: 'Canonical Artist',
      artworkUrl: 'https://img/a.jpg',
      providerRefs: { spotify: { url: 'https://open.spotify.com/track/x' }, youtube: { url: 'https://youtu.be/x' } },
    }
  },
}
const notFoundClient: OdesliClient = { async resolve() { return { notFound: true, providerRefs: {} } } }

async function seedPending(id: string) {
  await db.insertInto('tracks').values({ id, title: 'Seed', artist: 'Seed', resolution_status: 'pending' }).execute()
}

describe('resolveTrack', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })
  beforeEach(async () => { await db.deleteFrom('tracks').execute() })
  afterAll(async () => { await db.deleteFrom('tracks').execute(); await db.destroy() })

  it('resolves a cross-resolvable track and stores provider_refs + canonical metadata', async () => {
    await seedPending('isrc:X')
    const job: ResolveJob = { identity: 'isrc:X', sourceUrl: 'https://open.spotify.com/track/x', provider: 'spotify' }
    await resolveTrack(db, okClient, job)
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'isrc:X').executeTakeFirst()
    expect(t?.resolution_status).toBe('resolved')
    expect(t?.title).toBe('Canonical Title')
    expect(t?.artist).toBe('Canonical Artist')
    expect(t?.artwork_url).toBe('https://img/a.jpg')
    expect(t?.provider_refs).toEqual({ spotify: { url: 'https://open.spotify.com/track/x' }, youtube: { url: 'https://youtu.be/x' } })
    expect(t?.resolved_at).not.toBeNull()
  })

  it('marks a Bandcamp (self-contained) track without calling Odesli', async () => {
    await seedPending('ta:band|song')
    const job: ResolveJob = { identity: 'ta:band|song', sourceUrl: 'https://artist.bandcamp.com/track/x', provider: 'bandcamp' }
    const throwing: OdesliClient = { async resolve() { throw new Error('should not be called') } }
    await resolveTrack(db, throwing, job)
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'ta:band|song').executeTakeFirst()
    expect(t?.resolution_status).toBe('self_contained')
    expect(t?.provider_refs).toEqual({ bandcamp: { url: 'https://artist.bandcamp.com/track/x' } })
  })

  it('marks a not-found track as failed and keeps the seeded title', async () => {
    await seedPending('isrc:Y')
    const job: ResolveJob = { identity: 'isrc:Y', sourceUrl: 'https://open.spotify.com/track/y', provider: 'spotify' }
    await resolveTrack(db, notFoundClient, job)
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'isrc:Y').executeTakeFirst()
    expect(t?.resolution_status).toBe('failed')
    expect(t?.title).toBe('Seed') // not clobbered
  })
})
