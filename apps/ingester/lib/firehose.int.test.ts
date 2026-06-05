import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createDb, createMigrator } from '@onrepeat/db'
import { createIngester } from './firehose'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

const db = createDb(url)

describe('createIngester', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('constructs without throwing and exposes start/stop', async () => {
    const ingester = await createIngester({
      db,
      relay: 'wss://example.invalid',
    })
    expect(typeof ingester.start).toBe('function')
    expect(typeof ingester.stop).toBe('function')
  })
})
