import type { Updateable } from 'kysely'
import type { DB, TracksTable } from '@onrepeat/db'
import { providerTier } from '@onrepeat/core'
import { resolveLog, type ResolveJob } from '@onrepeat/jobs'
import {
  resolveTrack,
  type ResolveDeps,
  type BandcampFetcher,
} from '@onrepeat/music'

/** Source-cover fetcher (Spotify/YouTube/SoundCloud oEmbed); used as an artwork fallback. */
export type OembedFetcher = (
  provider: string,
  url: string,
) => Promise<{ thumbnail?: string } | null>

export type ResolverDeps = ResolveDeps & {
  bandcamp?: BandcampFetcher
  oembed?: OembedFetcher
}

/** Resolve one queue job onto its tracks row. Idempotent (keyed by job.identity). */
export async function resolveJob(
  db: DB,
  deps: ResolverDeps,
  job: ResolveJob,
): Promise<void> {
  const now = new Date()

  if (providerTier(job.provider) === 'self-contained') {
    // Bandcamp (the only self-contained provider): scrape its embed id so the Player can
    // stream it inline (fall back to a bare url/link-out), and its cover art in the same
    // request — Bandcamp jams have no artwork otherwise (the picker drops to manual entry).
    const entry: { url: string; trackId?: string } = { url: job.sourceUrl }
    let artworkUrl: string | undefined
    if (job.provider === 'bandcamp' && deps.bandcamp) {
      const meta = await deps.bandcamp(job.sourceUrl)
      if (meta?.trackId) entry.trackId = meta.trackId
      if (meta?.artworkUrl) artworkUrl = meta.artworkUrl
    }
    const update: Updateable<TracksTable> = {
      provider_refs: JSON.stringify({ [job.provider]: entry }),
      resolution_status: 'self_contained',
      resolved_at: now,
    }
    if (artworkUrl) update.artwork_url = artworkUrl
    await db
      .updateTable('tracks')
      .set(update)
      .where('id', '=', job.identity)
      .execute()
    resolveLog(
      'resolved',
      job.identity,
      `self_contained bandcamp trackId=${entry.trackId ?? 'none'}${artworkUrl ? ' +art' : ''}`,
    )
    return
  }

  // The producer seeds title/artist on the pending row before enqueue; use them
  // as the anchor query for cross-platform search.
  const seed = await db
    .selectFrom('tracks')
    .select(['title', 'artist', 'artwork_url'])
    .where('id', '=', job.identity)
    .executeTakeFirst()

  const result = await resolveTrack(
    {
      sourceUrl: job.sourceUrl,
      sourceProvider: job.provider,
      title: seed?.title ?? '',
      artist: seed?.artist ?? '',
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

  // Artwork: prefer iTunes' canonical cover; else keep what we already have; else fetch the
  // source's own cover (Spotify/YouTube/SoundCloud oEmbed) so the track has art without a match.
  let artworkUrl: string | null | undefined
  let artSource = 'none'
  if (result.artworkUrl) {
    artworkUrl = result.artworkUrl
    artSource = 'apple'
  } else if (seed?.artwork_url) {
    artworkUrl = seed.artwork_url
    artSource = 'seed'
  } else if (deps.oembed) {
    const o = await deps.oembed(job.provider, job.sourceUrl)
    if (o?.thumbnail) {
      artworkUrl = o.thumbnail
      artSource = 'oembed'
    }
  }
  if (artworkUrl) update.artwork_url = artworkUrl

  await db
    .updateTable('tracks')
    .set(update)
    .where('id', '=', job.identity)
    .execute()
  resolveLog(
    'resolved',
    job.identity,
    `[${Object.keys(result.providerRefs).join(', ')}]`,
    `art:${artSource}`,
    '·',
    ...result.notes,
  )
}
