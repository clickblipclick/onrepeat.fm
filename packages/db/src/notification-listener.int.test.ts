import { sql } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { createDb } from './client'
import { resolveInttestUrl } from './inttest-guard'
import { createMigrator } from './migrate'
import {
  createNotificationListener,
  type NotificationListener,
} from './notification-listener'

const db = createDb(resolveInttestUrl())

const RECIPIENT = 'did:plc:listener-recipient'
const OTHER = 'did:plc:listener-other'
const ACTOR = 'did:plc:listener-actor'

let uriSeq = 0
async function insertNotificationFor(recipientDid: string): Promise<void> {
  await db
    .insertInto('notifications')
    .values({
      record_uri: `at://${ACTOR}/fm.onrepeat.feed.like/listener${++uriSeq}`,
      recipient_did: recipientDid,
      actor_did: ACTOR,
      type: 'like',
      subject_uri: `at://${recipientDid}/fm.onrepeat.feed.jam/listener1`,
      created_at: '2026-07-01T00:00:00.000Z',
    })
    .execute()
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('notification listener', () => {
  let listener: NotificationListener

  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })

  afterEach(async () => {
    await listener?.close()
    await db
      .deleteFrom('notifications')
      .where('recipient_did', 'in', [RECIPIENT, OTHER])
      .execute()
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('delivers to a subscriber when a notification for their did is inserted', async () => {
    listener = await createNotificationListener(resolveInttestUrl())
    let delivered = 0
    listener.subscribe(RECIPIENT, () => delivered++)

    await insertNotificationFor(RECIPIENT)

    await waitFor(() => delivered >= 1)
    expect(delivered).toBe(1)
  })

  it('does not deliver to subscribers of a different did', async () => {
    listener = await createNotificationListener(resolveInttestUrl())
    let recipientDelivered = 0
    let otherDelivered = 0
    listener.subscribe(RECIPIENT, () => recipientDelivered++)
    listener.subscribe(OTHER, () => otherDelivered++)

    await insertNotificationFor(RECIPIENT)

    // Wait for the matching subscriber so a misdirected delivery had time to land too.
    await waitFor(() => recipientDelivered >= 1)
    expect(recipientDelivered).toBe(1)
    expect(otherDelivered).toBe(0)
  })

  it('stops delivering after unsubscribe', async () => {
    listener = await createNotificationListener(resolveInttestUrl())
    let delivered = 0
    const unsubscribe = listener.subscribe(RECIPIENT, () => delivered++)

    await insertNotificationFor(RECIPIENT)
    await waitFor(() => delivered >= 1)
    expect(delivered).toBe(1)

    unsubscribe()
    await insertNotificationFor(RECIPIENT)
    await new Promise((r) => setTimeout(r, 300))
    expect(delivered).toBe(1)
  })

  it('reconnects and resumes delivery after the connection drops', async () => {
    const errors: unknown[] = []
    listener = await createNotificationListener(resolveInttestUrl(), {
      reconnectDelayMs: 50,
      onError: (err) => errors.push(err),
    })
    let delivered = 0
    listener.subscribe(RECIPIENT, () => delivered++)

    // Kill the listener's backend out from under it (simulates a Postgres
    // restart / dropped connection).
    await sql`
      select pg_terminate_backend(pid) from pg_stat_activity
      where pid <> pg_backend_pid() and query ilike 'listen %'
    `.execute(db)

    // The exact reconnect moment isn't observable from outside, so retry:
    // insert fresh rows until one lands after LISTEN is re-established.
    for (let attempt = 0; attempt < 10 && delivered === 0; attempt++) {
      await insertNotificationFor(RECIPIENT)
      await waitFor(() => delivered >= 1, 500)
    }
    expect(delivered).toBeGreaterThanOrEqual(1)
  })
})
