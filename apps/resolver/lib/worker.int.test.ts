import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import type { OdesliClient } from '@onrepeat/music'
import { makeResolveHandler } from './worker'

const url = process.env.DATABASE_URL ?? 'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

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
    await db.deleteFrom('tracks').execute()
    await db.insertInto('tracks').values({ id: 'isrc:X', title: 'Seed', resolution_status: 'pending' }).execute()
  })
  afterAll(async () => { await db.deleteFrom('tracks').execute(); await db.destroy() })

  it('resolves successfully', async () => {
    const ok: OdesliClient = { async resolve() { return { notFound: false, title: 'T', providerRefs: { spotify: { url: 'u' } } } } }
    const handler = makeResolveHandler(db, ok)
    await handler([fakeJob()])
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'isrc:X').executeTakeFirst()
    expect(t?.resolution_status).toBe('resolved')
  })

  it('rethrows a transient error when retries remain (pg-boss will retry)', async () => {
    const boom: OdesliClient = { async resolve() { throw new Error('odesli 503') } }
    const handler = makeResolveHandler(db, boom)
    await expect(handler([fakeJob({ retryCount: 0, retryLimit: 5 })])).rejects.toThrow(/503/)
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'isrc:X').executeTakeFirst()
    expect(t?.resolution_status).toBe('pending')
  })

  it('marks failed (no rethrow) on the final attempt', async () => {
    const boom: OdesliClient = { async resolve() { throw new Error('odesli 503') } }
    const handler = makeResolveHandler(db, boom)
    await handler([fakeJob({ retryCount: 5, retryLimit: 5 })])
    const t = await db.selectFrom('tracks').selectAll().where('id', '=', 'isrc:X').executeTakeFirst()
    expect(t?.resolution_status).toBe('failed')
  })
})
