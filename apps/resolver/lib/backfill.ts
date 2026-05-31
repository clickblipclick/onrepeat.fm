import type { PgBoss } from 'pg-boss' // v12 named export (NOT default)
import type { DB } from '@onrepeat/db'
import { JAM_NSID, type JamRecord } from '@onrepeat/lexicons'
import { enqueueResolveForJam } from '@onrepeat/jobs'

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

/** Enqueue resolve jobs for every jam with no track_id. Idempotent. Returns the count enqueued. */
export async function backfill(db: DB, boss: PgBoss): Promise<number> {
  const rows = await db
    .selectFrom('jams')
    .select(['uri', 'source_url', 'source_provider', 'raw_title', 'raw_artist'])
    .where('track_id', 'is', null)
    .execute()

  for (const row of rows) {
    await enqueueResolveForJam(boss, db, { uri: row.uri, record: recordFromRow(row) })
  }
  console.log(`[resolver] backfill enqueued ${rows.length} jam(s)`)
  return rows.length
}
