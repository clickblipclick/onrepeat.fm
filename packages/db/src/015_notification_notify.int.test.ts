import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { LIKE_NSID } from '@onrepeat/lexicons'

import { createDb } from './client'
import { indexLike } from './index-write'
import { resolveInttestUrl } from './inttest-guard'
import { createMigrator } from './migrate'

const db = createDb(resolveInttestUrl())

const RECIPIENT = 'did:plc:notifytrigger-author'
const LIKER = 'did:plc:notifytrigger-liker'
const JAM_URI = `at://${RECIPIENT}/fm.onrepeat.feed.jam/notifytrigger1`
const LIKE_URI = `at://${LIKER}/${LIKE_NSID}/notifytrigger1`

const likeRecord = {
  $type: LIKE_NSID as 'fm.onrepeat.feed.like',
  subject: { uri: JAM_URI, cid: 'bafynotifytrigger' },
  createdAt: '2026-07-01T00:00:00.000Z',
}

describe('notifications NOTIFY trigger', () => {
  let listener: pg.Client
  const received: string[] = []

  // NOTIFY is async delivery; poll until the expected count arrives or time out.
  const waitForPayloads = async (count: number, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs
    while (received.length < count && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25))
    }
  }

  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
    listener = new pg.Client({ connectionString: resolveInttestUrl() })
    await listener.connect()
    listener.on('notification', (msg) => {
      received.push(msg.payload ?? '')
    })
    await listener.query('LISTEN notifications')
  })

  beforeEach(async () => {
    received.length = 0
    await db.deleteFrom('likes').where('uri', '=', LIKE_URI).execute()
    await db
      .deleteFrom('notifications')
      .where('record_uri', '=', LIKE_URI)
      .execute()
    await db
      .deleteFrom('notification_state')
      .where('did', '=', RECIPIENT)
      .execute()
  })

  afterAll(async () => {
    await db.deleteFrom('likes').where('uri', '=', LIKE_URI).execute()
    await db
      .deleteFrom('notifications')
      .where('record_uri', '=', LIKE_URI)
      .execute()
    await db
      .deleteFrom('notification_state')
      .where('did', '=', RECIPIENT)
      .execute()
    await listener.end()
    await db.destroy()
  })

  it('emits a NOTIFY with the recipient did when a notification is inserted', async () => {
    await indexLike(db, { uri: LIKE_URI, did: LIKER, record: likeRecord })

    await waitForPayloads(1)
    expect(received).toEqual([RECIPIENT])
  })

  it('does not re-notify when firehose redelivery hits the DO NOTHING conflict', async () => {
    await indexLike(db, { uri: LIKE_URI, did: LIKER, record: likeRecord })
    await waitForPayloads(1)
    expect(received).toEqual([RECIPIENT])

    // Redelivery of the same record: the notifications insert is ON CONFLICT DO
    // NOTHING, so no row is inserted and the trigger must not fire again.
    await indexLike(db, { uri: LIKE_URI, did: LIKER, record: likeRecord })
    await new Promise((r) => setTimeout(r, 300))
    expect(received).toEqual([RECIPIENT])
  })

  it('emits a NOTIFY when the seen watermark advances (insert and update)', async () => {
    // Mirrors markNotificationsSeen's upsert: first visit inserts the state row,
    // later visits update it. Both must broadcast so open tabs clear their badge.
    const upsertSeen = () =>
      db
        .insertInto('notification_state')
        .values({ did: RECIPIENT, seen_at: new Date() })
        .onConflict((oc) =>
          oc.column('did').doUpdateSet({ seen_at: new Date() }),
        )
        .execute()

    await upsertSeen()
    await waitForPayloads(1)
    expect(received).toEqual([RECIPIENT])

    await upsertSeen()
    await waitForPayloads(2)
    expect(received).toEqual([RECIPIENT, RECIPIENT])
  })
})
