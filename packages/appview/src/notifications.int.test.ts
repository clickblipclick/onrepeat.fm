import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDb, createMigrator } from '@onrepeat/db'

import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsSeen,
} from './read'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

const ME = 'did:plc:me'
const OTHER = 'did:plc:other'
const MY_JAM = `at://${ME}/fm.onrepeat.feed.jam/1`

async function insertNotification(o: {
  recordUri: string
  actorDid: string
  type?: 'like' | 'rejam'
  recipientDid?: string
  subjectUri?: string
  createdAt: string
  indexedAt?: string
}) {
  const base = {
    record_uri: o.recordUri,
    recipient_did: o.recipientDid ?? ME,
    actor_did: o.actorDid,
    type: o.type ?? 'like',
    subject_uri: o.subjectUri ?? MY_JAM,
    created_at: o.createdAt,
  }
  await db
    .insertInto('notifications')
    .values(o.indexedAt ? { ...base, indexed_at: o.indexedAt } : base)
    .execute()
}

describe('notifications reads', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })
  beforeEach(async () => {
    await db.deleteFrom('notifications').execute()
    await db.deleteFrom('notification_state').execute()
    await db.deleteFrom('jams').execute()
    await db.deleteFrom('actors').execute()
  })
  afterAll(async () => {
    await db.deleteFrom('notifications').execute()
    await db.deleteFrom('notification_state').execute()
    await db.deleteFrom('jams').execute()
    await db.deleteFrom('actors').execute()
    await db.destroy()
  })

  it('returns only my notifications, newest-first, with the subject jam hydrated', async () => {
    await db
      .insertInto('jams')
      .values({
        uri: MY_JAM,
        cid: 'c',
        author_did: ME,
        source_url: 'https://open.spotify.com/track/x',
        source_provider: 'spotify',
        raw_title: 'My Song',
        raw_artist: 'My Artist',
        created_at: '2026-07-01T00:00:00.000Z',
      })
      .execute()
    await insertNotification({
      recordUri: `at://${OTHER}/fm.onrepeat.feed.like/1`,
      actorDid: OTHER,
      createdAt: '2026-07-02T00:00:00.000Z',
    })
    await insertNotification({
      recordUri: `at://${OTHER}/fm.onrepeat.feed.jam/rj`,
      actorDid: OTHER,
      type: 'rejam',
      createdAt: '2026-07-03T00:00:00.000Z',
    })
    await insertNotification({
      recordUri: `at://${ME}/fm.onrepeat.feed.like/elsewhere`,
      actorDid: ME,
      recipientDid: OTHER,
      createdAt: '2026-07-02T12:00:00.000Z',
    })

    const page = await getNotifications(db, { did: ME })
    expect(page.notifications.map((n) => n.type)).toEqual(['rejam', 'like'])
    expect(page.notifications[0]!.actorDid).toBe(OTHER)
    expect(page.notifications[0]!.jam?.title).toBe('My Song')
    expect(page.cursor).toBeUndefined()
  })

  it('hydrates a deleted subject jam as null', async () => {
    await insertNotification({
      recordUri: `at://${OTHER}/fm.onrepeat.feed.like/1`,
      actorDid: OTHER,
      createdAt: '2026-07-02T00:00:00.000Z',
    })
    const page = await getNotifications(db, { did: ME })
    expect(page.notifications).toHaveLength(1)
    expect(page.notifications[0]!.jam).toBeNull()
  })

  it('paginates by cursor without duplicates or gaps', async () => {
    for (let i = 0; i < 5; i++)
      await insertNotification({
        recordUri: `at://${OTHER}/fm.onrepeat.feed.like/${i}`,
        actorDid: OTHER,
        createdAt: `2026-07-0${i + 1}T00:00:00.000Z`,
      })
    const p1 = await getNotifications(db, { did: ME, limit: 2 })
    expect(p1.notifications).toHaveLength(2)
    expect(p1.cursor).toBeDefined()
    const p2 = await getNotifications(db, {
      did: ME,
      limit: 2,
      cursor: p1.cursor,
    })
    const p3 = await getNotifications(db, {
      did: ME,
      limit: 2,
      cursor: p2.cursor,
    })
    const all = [...p1.notifications, ...p2.notifications, ...p3.notifications]
    expect(new Set(all.map((n) => n.recordUri)).size).toBe(5)
    expect(p3.cursor).toBeUndefined()
  })

  it('hides notifications from actors that are not active upstream', async () => {
    await db
      .insertInto('actors')
      .values({ did: OTHER, status: 'suspended' })
      .execute()
    await insertNotification({
      recordUri: `at://${OTHER}/fm.onrepeat.feed.like/1`,
      actorDid: OTHER,
      createdAt: '2026-07-02T00:00:00.000Z',
    })
    const page = await getNotifications(db, { did: ME })
    expect(page.notifications).toHaveLength(0)
    expect(await getUnreadNotificationCount(db, ME)).toBe(0)
  })

  it('counts everything unread with no watermark, and zero after marking seen', async () => {
    await insertNotification({
      recordUri: `at://${OTHER}/fm.onrepeat.feed.like/1`,
      actorDid: OTHER,
      createdAt: '2026-07-02T00:00:00.000Z',
    })
    expect(await getUnreadNotificationCount(db, ME)).toBe(1)

    await markNotificationsSeen(db, ME)
    expect(await getUnreadNotificationCount(db, ME)).toBe(0)

    const page = await getNotifications(db, { did: ME })
    expect(page.notifications[0]!.seen).toBe(true)
  })

  it('returns follow notifications with no subject jam', async () => {
    await db
      .insertInto('notifications')
      .values({
        record_uri: `at://${OTHER}/fm.onrepeat.graph.follow/1`,
        recipient_did: ME,
        actor_did: OTHER,
        type: 'follow',
        subject_uri: null,
        created_at: '2026-07-02T00:00:00.000Z',
      })
      .execute()
    const page = await getNotifications(db, { did: ME })
    expect(page.notifications).toHaveLength(1)
    expect(page.notifications[0]!.type).toBe('follow')
    expect(page.notifications[0]!.subjectUri).toBeNull()
    expect(page.notifications[0]!.jam).toBeNull()
    expect(await getUnreadNotificationCount(db, ME)).toBe(1)
  })

  it('unread is arrival-based: a backdated like arriving after mark-seen still counts', async () => {
    await markNotificationsSeen(db, ME)
    // createdAt far in the past, but indexed (arrived) after the watermark
    await insertNotification({
      recordUri: `at://${OTHER}/fm.onrepeat.feed.like/old`,
      actorDid: OTHER,
      createdAt: '2020-01-01T00:00:00.000Z',
      indexedAt: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(await getUnreadNotificationCount(db, ME)).toBe(1)
    const page = await getNotifications(db, { did: ME })
    expect(page.notifications[0]!.seen).toBe(false)
  })
})
