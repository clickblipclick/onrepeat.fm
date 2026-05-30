import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import { loadCursor, saveCursor } from './cursor'

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
    expect(await loadCursor(db, 'firehose')).toBeUndefined()
  })

  it('saves then loads a cursor, and updates on re-save', async () => {
    await saveCursor(db, 'firehose', 12345)
    expect(await loadCursor(db, 'firehose')).toBe(12345)
    await saveCursor(db, 'firehose', 23456)
    expect(await loadCursor(db, 'firehose')).toBe(23456)
  })
})
