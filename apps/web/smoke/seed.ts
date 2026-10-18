import type { DB } from '@onrepeat/db'

/** What the smoke seed wrote, so the tests can look for it. */
export interface SeedInfo {
  did: string
  handle: string
  displayName: string
  theme: string
  /** The author's current jam (created an hour ago → "On repeat"). */
  current: { rkey: string; title: string; artist: string; caption: string }
  /** An older jam (ten days ago → "Archive"), unresolved so it renders raw fields. */
  archive: { rkey: string; title: string; artist: string }
  /** A second account that liked the current jam. */
  liker: { did: string; handle: string; displayName: string }
}

const JAM_NSID = 'fm.onrepeat.feed.jam'
const HOUR = 3600_000

export const SEED: SeedInfo = {
  did: 'did:plc:smoketestauthor000000000',
  handle: 'smoke.onrepeat.test',
  displayName: 'Smoke Tester',
  theme: 'teal',
  current: {
    rkey: 'smoke-current',
    title: 'Smoke Signal',
    artist: 'The Harness',
    caption: 'on repeat all week',
  },
  archive: {
    rkey: 'smoke-archive',
    title: 'Last Week’s Jam',
    artist: 'The Harness',
  },
  liker: {
    did: 'did:plc:smoketestliker0000000000',
    handle: 'liker.onrepeat.test',
    displayName: 'Smoke Liker',
  },
}

/**
 * Reset the content tables and write the rows the suite expects. Row shapes mirror the
 * appview integration fixtures (packages/appview/src/*.int.test.ts). Profiles carry a
 * fresh `profile_updated_at`, so author hydration is served from our own cache and
 * never reaches the (faked) AppView; only handle → DID resolution does.
 */
export async function seedSmokeData(
  db: DB,
  now = new Date(),
): Promise<SeedInfo> {
  for (const table of [
    'notifications',
    'notification_state',
    'likes',
    'follows',
    'jams',
    'tracks',
    'actors',
  ] as const) {
    await db.deleteFrom(table).execute()
  }

  await db
    .insertInto('actors')
    .values([
      {
        did: SEED.did,
        handle: SEED.handle,
        display_name: SEED.displayName,
        avatar: null,
        profile_updated_at: now,
        last_seen: now,
        color_theme: SEED.theme,
      },
      {
        did: SEED.liker.did,
        handle: SEED.liker.handle,
        display_name: SEED.liker.displayName,
        avatar: null,
        profile_updated_at: now,
        last_seen: now,
        color_theme: null,
      },
    ])
    .execute()

  const trackId = 'smoke-track-current'
  const sourceUrl = 'https://open.spotify.com/track/0smokesignal0000000000'
  await db
    .insertInto('tracks')
    .values({
      id: trackId,
      isrc: null,
      title: SEED.current.title,
      artist: SEED.current.artist,
      artwork_url: null,
      cdn_artwork_url: null,
      provider_refs: JSON.stringify({
        spotify: { url: sourceUrl, trackId: '0smokesignal0000000000' },
        youtube: {
          url: 'https://www.youtube.com/watch?v=smokesignal',
          videoId: 'smokesignal',
        },
      }),
      resolution_status: 'resolved',
      resolved_at: now,
    })
    .execute()

  const currentUri = `at://${SEED.did}/${JAM_NSID}/${SEED.current.rkey}`
  await db
    .insertInto('jams')
    .values([
      {
        uri: currentUri,
        cid: 'bafyreismokecurrent',
        author_did: SEED.did,
        track_id: trackId,
        source_url: sourceUrl,
        source_provider: 'spotify',
        raw_title: SEED.current.title,
        raw_artist: SEED.current.artist,
        raw_artwork_url: null,
        caption: SEED.current.caption,
        via_uri: null,
        via_did: null,
        created_at: new Date(now.getTime() - HOUR),
      },
      {
        uri: `at://${SEED.did}/${JAM_NSID}/${SEED.archive.rkey}`,
        cid: 'bafyreismokearchive',
        author_did: SEED.did,
        track_id: null,
        source_url: 'https://www.youtube.com/watch?v=lastweeksjam',
        source_provider: 'youtube',
        raw_title: SEED.archive.title,
        raw_artist: SEED.archive.artist,
        raw_artwork_url: null,
        caption: null,
        via_uri: null,
        via_did: null,
        created_at: new Date(now.getTime() - 10 * 24 * HOUR),
      },
    ])
    .execute()

  await db
    .insertInto('likes')
    .values({
      uri: `at://${SEED.liker.did}/fm.onrepeat.feed.like/smoke-like`,
      author_did: SEED.liker.did,
      subject_uri: currentUri,
      created_at: new Date(now.getTime() - HOUR / 2),
    })
    .execute()

  return SEED
}
