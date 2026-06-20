import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDb, createMigrator, recordFailedEvent } from './index'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

describe('failed_events dead-letter', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })
  beforeEach(async () => {
    await db.deleteFrom('failed_events').execute()
  })
  afterAll(async () => {
    await db.deleteFrom('failed_events').execute()
    await db.destroy()
  })

  it('records a failed event with seq, identity, record, and error', async () => {
    await recordFailedEvent(
      db,
      {
        seq: 42,
        did: 'did:plc:a',
        collection: 'fm.onrepeat.jam',
        action: 'create',
        uri: 'at://did:plc:a/fm.onrepeat.jam/1',
        cid: 'bafyabc',
        record: { $type: 'fm.onrepeat.jam', title: 'X' },
      },
      'boom: constraint violation',
    )
    const rows = await db.selectFrom('failed_events').selectAll().execute()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.seq).toBe('42') // bigint comes back as a string from pg
    expect(rows[0]!.uri).toBe('at://did:plc:a/fm.onrepeat.jam/1')
    expect(rows[0]!.error).toContain('boom')
    expect(rows[0]!.record).toEqual({ $type: 'fm.onrepeat.jam', title: 'X' })
  })

  it('stores a null record for delete events', async () => {
    await recordFailedEvent(
      db,
      {
        seq: 43,
        did: 'did:plc:a',
        collection: 'fm.onrepeat.like',
        action: 'delete',
        uri: 'at://did:plc:a/fm.onrepeat.like/1',
        cid: null,
        record: undefined,
      },
      'boom',
    )
    const rows = await db.selectFrom('failed_events').selectAll().execute()
    expect(rows[0]!.record).toBeNull()
  })
})
