import type { Updateable } from 'kysely'
import type { DB, TracksTable } from '@onrepeat/db'
import { providerTier } from '@onrepeat/core'
import type { ResolveJob } from '@onrepeat/jobs'
import { resolveTrack, type ResolveDeps, type BandcampFetcher } from '@onrepeat/music'

export type ResolverDeps = ResolveDeps & { bandcamp?: BandcampFetcher }

/** Resolve one queue job onto its tracks row. Idempotent (keyed by job.identity). */
export async function resolveJob(db: DB, deps: ResolverDeps, job: ResolveJob): Promise<void> {
  const now = new Date()

  if (providerTier(job.provider) === 'self-contained') {
    // Bandcamp (the only self-contained provider): scrape its embed id so the
    // Player can stream it inline; fall back to a bare url (link-out) on failure.
    let entry: { url: string; trackId?: string } = { url: job.sourceUrl }
    if (job.provider === 'bandcamp' && deps.bandcamp) {
      const embed = await deps.bandcamp(job.sourceUrl)
      if (embed) entry = { url: job.sourceUrl, trackId: embed.trackId }
    }
    await db
      .updateTable('tracks')
      .set({
        provider_refs: JSON.stringify({ [job.provider]: entry }),
        resolution_status: 'self_contained',
        resolved_at: now,
      })
      .where('id', '=', job.identity)
      .execute()
    return
  }

  // The producer seeds title/artist on the pending row before enqueue; use them
  // as the anchor query for cross-platform search.
  const seed = await db
    .selectFrom('tracks')
    .select(['title', 'artist'])
    .where('id', '=', job.identity)
    .executeTakeFirst()

  const result = await resolveTrack(
    { sourceUrl: job.sourceUrl, sourceProvider: job.provider, title: seed?.title ?? '', artist: seed?.artist ?? '' },
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

  await db.updateTable('tracks').set(update).where('id', '=', job.identity).execute()
}
