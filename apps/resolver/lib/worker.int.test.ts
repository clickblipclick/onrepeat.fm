import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import { type ResolverDeps } from './resolve'

const url = process.env.DATABASE_URL ?? 'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

// Mock resolveJob so we can control whether it succeeds or throws, without depending
// on the music-layer client error-swallowing behaviour.
vi.mock('./resolve', () => ({
  resolveJob: vi.fn(),
}))

// Import after mock registration so we get the mocked version.
const { resolveJob } = await import('./resolve')
const { makeResolveHandler } = await import('./worker')

const okDeps: ResolverDeps = { itunes: { async search() { return [] }, async lookup() { return null } } }

function fakeJob(over: Partial<{ retryCount: number; retryLimit: number }> = {}) {
  return {
    id: 'j1',
    name: 'resolve-track',
    data: { identity: 'isrc:X', sourceUrl: 'https://open.spotify.com/track/x', provider: 'spotify' },
    retryCount: 0,
    retryLimit: 5,
    ...over,
  } as any
}

describe('makeResolveHandler', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })
  beforeEach(async () => {
    vi.mocked(resolveJob).mockReset()
    await db.deleteFrom('tracks').execute()
    await db.insertInto('tracks').values({ id: 'isrc:X', title: 'Seed', resolution_status: 'pending' }).execute()
  })
  afterAll(async () => { await db.deleteFrom('tracks').execute(); await db.destroy() })

  it('resolves successfully', async () => {
    vi.mocked(resolveJob).mockResolvedValue(undefined)
    const handler = makeResolveHandler(db, okDeps)
    await handler([fakeJob()])
    // No DB write is expected from the handler itself on success — resolveJob handled it.
    // Just verify the handler didn't throw and resolveJob was called.
    expect(resolveJob).toHaveBeenCalledOnce()
  })

  it('rethrows a transient error when retries remain (pg-boss will retry)', async () => {
    vi.mocked(resolveJob).mockRejectedValue(new Error('resolve 503'))
    const handler = makeResolveHandler(db, okDeps)
    await expect(handler([fakeJob({ retryCount: 0, retryLimit: 5 })])).rejects.toThrow(/503/)
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'isrc:X').executeTakeFirst()
    expect(t?.resolution_status).toBe('pending')
  })

  it('marks failed (no rethrow) on the final attempt', async () => {
    vi.mocked(resolveJob).mockRejectedValue(new Error('resolve 503'))
    const handler = makeResolveHandler(db, okDeps)
    await handler([fakeJob({ retryCount: 5, retryLimit: 5 })])
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'isrc:X').executeTakeFirst()
    expect(t?.resolution_status).toBe('failed')
  })
})
