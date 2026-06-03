import type { Updateable } from 'kysely'
import type { DB, TracksTable } from '@onrepeat/db'
import { providerTier } from '@onrepeat/core'
import type { ResolveJob } from '@onrepeat/jobs'
import { resolveTrack, type ResolveDeps } from '@onrepeat/music'

/** Resolve one queue job onto its tracks row. Idempotent (keyed by job.identity). */
export async function resolveJob(db: DB, deps: ResolveDeps, job: ResolveJob): Promise<void> {
  const now = new Date()

  if (providerTier(job.provider) === 'self-contained') {
    await db
      .updateTable('tracks')
      .set({
        provider_refs: JSON.stringify({ [job.provider]: { url: job.sourceUrl } }),
        resolution_status: 'self_contained',
        resolved_at: now,
      })
      .where('id', '=', job.identity)
      .execute()
    return
  }

  // The producer seeds title/artist/isrc on the pending row before enqueue; use
  // them as the anchor query for cross-platform search.
  const seed = await db
    .selectFrom('tracks')
    .select(['title', 'artist', 'isrc'])
    .where('id', '=', job.identity)
    .executeTakeFirst()

  const result = await resolveTrack(
    {
      sourceUrl: job.sourceUrl,
      sourceProvider: job.provider,
      title: seed?.title ?? '',
      artist: seed?.artist ?? '',
      isrc: seed?.isrc ?? undefined,
    },
    deps,
  )

  const update: Updateable<TracksTable> = {
    provider_refs: JSON.stringify(result.providerRefs),
    resolution_status: 'resolved',
    resolved_at: now,
  }
  if (result.title) update.title = result.title
  if (result.artist) update.artist = result.artist
  if (result.artworkUrl) update.artwork_url = result.artworkUrl
  if (result.isrc) update.isrc = result.isrc

  await db.updateTable('tracks').set(update).where('id', '=', job.identity).execute()
}
