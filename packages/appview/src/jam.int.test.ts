import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDb, createMigrator } from '@onrepeat/db'

import { getJam } from './read'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const db = createDb(url)

async function insertJam(
  uri: string,
  did: string,
  createdAt: string,
  viaUri?: string,
  viaDid?: string,
) {
  await db
    .insertInto('jams')
    .values({
      uri,
      cid: 'c',
      author_did: did,
      track_id: null,
      source_url: 'u',
      source_provider: 'spotify',
      raw_title: 'T',
      raw_artist: 'A',
      caption: null,
      via_uri: viaUri ?? null,
      via_did: viaDid ?? null,
      created_at: createdAt,
    })
    .execute()
}

describe('getJam', () => {
  beforeAll(async () => {
    const { error } = await createMigrator(db).migrateToLatest()
    if (error) throw error
  })
  beforeEach(async () => {
    await db.deleteFrom('likes').execute()
    await db.deleteFrom('jams').execute()
  })
  afterAll(async () => {
    await db.deleteFrom('likes').execute()
    await db.deleteFrom('jams').execute()
    await db.destroy()
  })

  it('returns the jam, likers, likedByYou, and re-jams newest-first', async () => {
    const subject = 'at://did:plc:a/fm.onrepeat.feed.jam/1'
    await insertJam(subject, 'did:plc:a', '2026-05-30T00:00:00.000Z')
    // two re-jams of it
    await insertJam(
      'at://did:plc:b/fm.onrepeat.feed.jam/1',
      'did:plc:b',
      '2026-05-30T01:00:00.000Z',
      subject,
      'did:plc:a',
    )
    await insertJam(
      'at://did:plc:c/fm.onrepeat.feed.jam/1',
      'did:plc:c',
      '2026-05-30T02:00:00.000Z',
      subject,
      'did:plc:a',
    )
    await db
      .insertInto('likes')
      .values([
        {
          uri: 'at://did:plc:v/fm.onrepeat.feed.like/1',
          author_did: 'did:plc:viewer',
          subject_uri: subject,
          created_at: '2026-05-30T03:00:00.000Z',
        },
        {
          uri: 'at://did:plc:w/fm.onrepeat.feed.like/1',
          author_did: 'did:plc:w',
          subject_uri: subject,
          created_at: '2026-05-30T03:00:00.000Z',
        },
      ])
      .execute()

    const res = await getJam(db, { uri: subject, viewerDid: 'did:plc:viewer' })
    expect(res).not.toBeNull()
    expect(res!.jam.uri).toBe(subject)
    expect(res!.jam.likeCount).toBe(2)
    expect(res!.jam.likedByYou).toBe(true)
    expect(new Set(res!.likerDids)).toEqual(
      new Set(['did:plc:viewer', 'did:plc:w']),
    )
    expect(res!.reJams.map((j) => j.uri)).toEqual([
      'at://did:plc:c/fm.onrepeat.feed.jam/1', // newest first
      'at://did:plc:b/fm.onrepeat.feed.jam/1',
    ])
  })

  it('caps likers and re-jams to the requested limits while reporting the true like count', async () => {
    const subject = 'at://did:plc:a/fm.onrepeat.feed.jam/cap'
    await insertJam(subject, 'did:plc:a', '2026-05-30T00:00:00.000Z')
    for (let i = 0; i < 3; i++) {
      await insertJam(
        `at://did:plc:r${i}/fm.onrepeat.feed.jam/1`,
        `did:plc:r${i}`,
        `2026-05-30T0${i + 1}:00:00.000Z`,
        subject,
        'did:plc:a',
      )
    }
    await db
      .insertInto('likes')
      .values(
        [0, 1, 2].map((i) => ({
          uri: `at://did:plc:l${i}/fm.onrepeat.feed.like/1`,
          author_did: `did:plc:l${i}`,
          subject_uri: subject,
          created_at: `2026-05-30T0${i + 1}:00:00.000Z`,
        })),
      )
      .execute()

    const res = await getJam(db, {
      uri: subject,
      likersLimit: 2,
      reJamsLimit: 2,
    })
    expect(res!.jam.likeCount).toBe(3) // true total, not capped
    expect(res!.likerDids).toHaveLength(2) // capped
    expect(res!.reJams).toHaveLength(2) // capped
  })

  it('returns null for an unknown jam', async () => {
    expect(
      await getJam(db, { uri: 'at://did:plc:none/fm.onrepeat.feed.jam/x' }),
    ).toBeNull()
  })

  it('returns empty likers/re-jams and likedByYou=false for a bare jam', async () => {
    const subject = 'at://did:plc:a/fm.onrepeat.feed.jam/solo'
    await insertJam(subject, 'did:plc:a', '2026-05-30T00:00:00.000Z')
    const res = await getJam(db, { uri: subject, viewerDid: 'did:plc:viewer' })
    expect(res).not.toBeNull()
    expect(res!.jam.likeCount).toBe(0)
    expect(res!.jam.likedByYou).toBe(false)
    expect(res!.likerDids).toEqual([])
    expect(res!.reJams).toEqual([])
  })
})
