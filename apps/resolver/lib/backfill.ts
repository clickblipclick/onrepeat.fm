import type { PgBoss } from 'pg-boss' // v12 named export (NOT default)
import type { DB } from '@onrepeat/db'
import { JAM_NSID, type JamRecord } from '@onrepeat/lexicons'
import { enqueueResolveForJam, enqueueResolve } from '@onrepeat/jobs'

/**
 * Reconstruct a JamRecord from a `jams` row's denormalized columns (enough for the producer).
 * NOTE: the `jams` table doesn't persist ISRC, so backfilled jams always get the
 * `ta:<artist>|<title>` track identity even if the original record carried an ISRC. A track
 * jammed live (isrc: identity) and the same track backfilled (ta: identity) would land on
 * separate `tracks` rows. This is out of practical reach today (backfill only touches
 * `track_id IS NULL` jams, and the live producer links `track_id` synchronously at enqueue),
 * and is the same family as the documented "no Odesli-id merge" MVP limitation.
 */
function recordFromRow(row: {
  source_url: string
  source_provider: string | null
  raw_title: string | null
  raw_artist: string | null
}): JamRecord {
  return {
    $type: JAM_NSID,
    sourceUrl: row.source_url,
    sourceProvider: row.source_provider ?? '',
    title: row.raw_title ?? '',
    artist: row.raw_artist ?? '',
    createdAt: '1970-01-01T00:00:00.000Z', // unused by the producer
  }
}

/**
 * Enqueue resolve jobs for (1) every jam with no track_id (via the producer, which
 * links track_id) and (2) every already-linked track still in a `resolved`/`failed`
 * state — re-enqueued directly so Odesli-era rows pick up the new Spotify/YouTube
 * cross-links (the producer would skip `resolved`). Idempotent; returns the count.
 */
export async function backfill(db: DB, boss: PgBoss): Promise<number> {
  const unlinked = await db
    .selectFrom('jams')
    .select(['uri', 'source_url', 'source_provider', 'raw_title', 'raw_artist'])
    .where('track_id', 'is', null)
    .execute()
  for (const row of unlinked) {
    await enqueueResolveForJam(boss, db, { uri: row.uri, record: recordFromRow(row) })
  }

  const stale = await db
    .selectFrom('tracks')
    .innerJoin('jams', 'jams.track_id', 'tracks.id')
    .select(['tracks.id as identity', 'jams.source_url as sourceUrl', 'jams.source_provider as sourceProvider'])
    .where('tracks.resolution_status', 'in', ['resolved', 'failed'])
    .distinctOn('tracks.id')
    .execute()
  for (const t of stale) {
    await enqueueResolve(boss, { identity: t.identity, sourceUrl: t.sourceUrl, provider: t.sourceProvider ?? '' })
  }

  console.log(`[resolver] backfill enqueued ${unlinked.length} unlinked + ${stale.length} re-resolve`)
  return unlinked.length + stale.length
}
