import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDb, createMigrator, upsertActorProfiles } from '@onrepeat/db'

import { loadActorProfiles } from './read'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

const A = 'did:plc:loadProfA'
const B = 'did:plc:loadProfB'

describe('loadActorProfiles', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })
  beforeEach(async () => {
    await db.deleteFrom('actors').where('did', 'in', [A, B]).execute()
  })
  afterAll(async () => {
    await db.deleteFrom('actors').where('did', 'in', [A, B]).execute()
    await db.destroy()
  })

  it('round-trips positive + negative rows with their freshness stamp', async () => {
    const at = new Date('2026-06-22T00:00:00.000Z')
    await upsertActorProfiles(
      db,
      [
        {
          did: A,
          profile: { handle: 'a.test', displayName: 'Ay', avatar: 'av.jpg' },
        },
        { did: B, profile: null },
      ],
      at,
    )
    const m = await loadActorProfiles(db, [A, B])
    expect(m.get(A)).toEqual({
      profile: {
        did: A,
        handle: 'a.test',
        displayName: 'Ay',
        avatar: 'av.jpg',
      },
      updatedAt: at,
    })
    expect(m.get(B)).toEqual({ profile: null, updatedAt: at })
  })

  it('reports a never-hydrated row (no profile_updated_at) as updatedAt: null', async () => {
    await db
      .insertInto('actors')
      .values({ did: A, last_seen: new Date() })
      .execute()
    const m = await loadActorProfiles(db, [A])
    expect(m.get(A)).toEqual({ profile: null, updatedAt: null })
  })

  it('is empty-safe and omits unknown DIDs', async () => {
    expect((await loadActorProfiles(db, [])).size).toBe(0)
    expect((await loadActorProfiles(db, ['did:plc:nope'])).size).toBe(0)
  })
})
