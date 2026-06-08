import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'kysely'
import { createDb, createMigrator } from '@onrepeat/db'
import { KyselyStateStore, KyselySessionStore } from './stores'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

const db = createDb(url)

describe('Kysely OAuth stores', () => {
  beforeAll(async () => {
    await sql`drop schema if exists public cascade`.execute(db)
    await sql`create schema public`.execute(db)
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('state store: set/get/del round-trip and missing-key returns undefined', async () => {
    const store = new KyselyStateStore(db)
    expect(await store.get('missing')).toBeUndefined()
    await store.set('k1', { foo: 'bar' } as any)
    expect(await store.get('k1')).toEqual({ foo: 'bar' })
    await store.set('k1', { foo: 'baz' } as any) // upsert
    expect(await store.get('k1')).toEqual({ foo: 'baz' })
    await store.del('k1')
    expect(await store.get('k1')).toBeUndefined()
  })

  it('state store: deleteExpiredState prunes rows past the TTL, keeps fresh ones', async () => {
    const store = new KyselyStateStore(db)
    await store.set('stale', { a: 1 } as any)
    // Run cleanup as if it were 2h from now → the just-written row is past the 1h TTL.
    const deleted = await store.deleteExpiredState(
      new Date(Date.now() + 2 * 60 * 60 * 1000),
    )
    expect(deleted).toBeGreaterThanOrEqual(1)
    expect(await store.get('stale')).toBeUndefined()
    // A fresh row survives a cleanup run at the current time.
    await store.set('fresh', { a: 2 } as any)
    expect(await store.deleteExpiredState(new Date())).toBe(0)
    expect(await store.get('fresh')).toEqual({ a: 2 })
    await store.del('fresh')
  })

  it('session store: set/get/del round-trip keyed by did', async () => {
    const store = new KyselySessionStore(db)
    expect(await store.get('did:plc:x')).toBeUndefined()
    await store.set('did:plc:x', { tokenSet: 1 } as any)
    expect(await store.get('did:plc:x')).toEqual({ tokenSet: 1 })
    await store.del('did:plc:x')
    expect(await store.get('did:plc:x')).toBeUndefined()
  })
})
