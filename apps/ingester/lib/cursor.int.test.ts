import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDb, createMigrator } from '@onrepeat/db'

import { loadCursorState, saveCursor } from './cursor'

const loadCursor = async (service: string): Promise<number | undefined> =>
  (await loadCursorState(db, service))?.cursor

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

const db = createDb(url)

describe('cursor persistence', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })

  beforeEach(async () => {
    await db.deleteFrom('subscription_state').execute()
  })

  afterAll(async () => {
    await db.deleteFrom('subscription_state').execute()
    await db.destroy()
  })

  it('returns undefined when no cursor is stored', async () => {
    expect(await loadCursor('firehose')).toBeUndefined()
  })

  it('saves then loads a cursor, and updates on re-save', async () => {
    await saveCursor(db, 'firehose', 12345)
    expect(await loadCursor('firehose')).toBe(12345)
    await saveCursor(db, 'firehose', 23456)
    expect(await loadCursor('firehose')).toBe(23456)
  })

  it('never regresses: a late write with an older seq is a no-op', async () => {
    await saveCursor(db, 'firehose', 23456)
    await saveCursor(db, 'firehose', 12345) // stale in-flight write landing late
    expect(await loadCursor('firehose')).toBe(23456)
  })

  it('loadCursorState reports when the cursor last advanced', async () => {
    const before = Date.now()
    await saveCursor(db, 'firehose', 99)
    const state = await loadCursorState(db, 'firehose')
    expect(state?.cursor).toBe(99)
    expect(state!.updatedAt.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(state!.updatedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })
})
