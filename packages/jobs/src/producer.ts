import type { PgBoss } from 'pg-boss' // v12 named export (NOT default)
import type { DB } from '@onrepeat/db'
import { trackIdentity } from '@onrepeat/core'
import type { JamRecord } from '@onrepeat/lexicons'
import { enqueueResolve } from './queue'

export interface JamForResolve {
  /** the jam's at-uri (to link jams.track_id) */
  uri: string
  record: JamRecord
}

/**
 * On a newly-indexed jam: compute its track identity, upsert a pending `tracks`
 * row seeded with the jam's denormalized metadata, link `jams.track_id`, and
 * enqueue a resolve job. Skips enqueue only when the track is already
 * resolved/self_contained; pending and failed tracks are (re-)enqueued, deduped
 * by singletonKey while a job is still queued.
 */
export async function enqueueResolveForJam(boss: PgBoss, db: DB, jam: JamForResolve): Promise<void> {
  const { record } = jam
  let identity: string
  try {
    identity = trackIdentity({ isrc: record.isrc, title: record.title, artist: record.artist })
  } catch (err) {
    // A record with no usable identity fields can't be resolved; skip without
    // stalling the firehose. (DB/enqueue errors below still propagate to retry.)
    console.warn(`[jobs] skipping resolve for ${jam.uri}: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  await db
    .insertInto('tracks')
    .values({
      id: identity,
      isrc: record.isrc ?? null,
      title: record.title ?? null,
      artist: record.artist ?? null,
      artwork_url: record.artworkUrl ?? null,
    })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()

  await db.updateTable('jams').set({ track_id: identity }).where('uri', '=', jam.uri).execute()

  const track = await db
    .selectFrom('tracks')
    .select('resolution_status')
    .where('id', '=', identity)
    .executeTakeFirst()
  if (track?.resolution_status === 'resolved' || track?.resolution_status === 'self_contained') return

  await enqueueResolve(boss, { identity, sourceUrl: record.sourceUrl, provider: record.sourceProvider })
}
