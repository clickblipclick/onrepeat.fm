import { randomBytes } from 'node:crypto'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb, createMigrator } from '@onrepeat/db'

import { createStoreCipher } from './crypto'
import { KyselySessionStore, KyselyStateStore } from './stores'

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
    // Run cleanup as if it were 2h from now → the just-written row is past the TTL.
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

  it('state store: get() refuses rows past the TTL even before cleanup runs', async () => {
    const store = new KyselyStateStore(db)
    await store.set('expired', { a: 1 } as any)
    // Backdate past the 10-minute TTL without running the cleanup sweep.
    await sql`update oauth_state set created_at = now() - interval '11 minutes' where key = 'expired'`.execute(
      db,
    )
    expect(await store.get('expired')).toBeUndefined()
    await store.del('expired')
  })

  it('stores ciphertext at rest when a cipher is configured', async () => {
    const cipher = createStoreCipher(randomBytes(32).toString('base64'))
    const sessions = new KyselySessionStore(db, { cipher })
    const states = new KyselyStateStore(db, { cipher })

    await sessions.set('did:plc:enc', {
      tokenSet: { refresh_token: 'rt-secret' },
    } as any)
    const rawSession = await db
      .selectFrom('oauth_session')
      .select('session')
      .where('did', '=', 'did:plc:enc')
      .executeTakeFirstOrThrow()
    expect(rawSession.session).toMatch(/^enc1\./)
    expect(rawSession.session).not.toContain('rt-secret')
    expect(await sessions.get('did:plc:enc')).toEqual({
      tokenSet: { refresh_token: 'rt-secret' },
    })

    await states.set('enc-state', { verifier: 'pkce-secret' } as any)
    const rawState = await db
      .selectFrom('oauth_state')
      .select('state')
      .where('key', '=', 'enc-state')
      .executeTakeFirstOrThrow()
    expect(rawState.state).toMatch(/^enc1\./)
    expect(await states.get('enc-state')).toEqual({ verifier: 'pkce-secret' })

    await sessions.del('did:plc:enc')
    await states.del('enc-state')
  })

  it('reads legacy plaintext rows after a cipher is enabled', async () => {
    const cipher = createStoreCipher(randomBytes(32).toString('base64'))
    const sessions = new KyselySessionStore(db, { cipher })
    await db
      .insertInto('oauth_session')
      .values({
        did: 'did:plc:legacy',
        session: JSON.stringify({ tokenSet: 2 }),
      })
      .execute()
    expect(await sessions.get('did:plc:legacy')).toEqual({ tokenSet: 2 })
    await sessions.del('did:plc:legacy')
  })
})
