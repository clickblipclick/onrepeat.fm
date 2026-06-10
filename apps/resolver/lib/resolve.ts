import type { Updateable } from 'kysely'
import type { DB, TracksTable } from '@onrepeat/db'
import { providerFromUrl, providerTier } from '@onrepeat/core'
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

  // SECURITY (SSRF): job.provider / job.sourceUrl originate from an untrusted firehose
  // record. Re-derive the provider from the URL host (allowlist in providerFromUrl) and
  // ignore the record's self-declared provider, so a record can't claim provider:"bandcamp"
  // on a `http://169.254.169.254/...` url and turn the self-contained fetch into a probe of
  // internal services. A url whose host isn't a known music provider can't be resolved —
  // mark it failed rather than fetching it.
  const provider = providerFromUrl(job.sourceUrl)
  if (!provider) {
    await db
      .updateTable('tracks')
      .set({ resolution_status: 'failed', resolved_at: now })
      .where('id', '=', job.identity)
      .execute()
    resolveLog(
      'skip',
      job.identity,
      'untrusted/unrecognized source url host — marked failed',
    )
    return
  }

  if (providerTier(provider) === 'self-contained') {
    // Bandcamp (the only self-contained provider): scrape its embed id so the Player can
    // stream it inline (fall back to a bare url/link-out), and its cover art in the same
    // request — Bandcamp jams have no artwork otherwise (the picker drops to manual entry).
    const entry: { url: string; trackId?: string } = { url: job.sourceUrl }
    let artworkUrl: string | undefined
    if (provider === 'bandcamp' && deps.bandcamp) {
      const meta = await deps.bandcamp(job.sourceUrl)
      if (meta?.trackId) entry.trackId = meta.trackId
      if (meta?.artworkUrl) artworkUrl = meta.artworkUrl
    }
    const update: Updateable<TracksTable> = {
      provider_refs: JSON.stringify({ [provider]: entry }),
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
      `self_contained ${provider} trackId=${entry.trackId ?? 'none'}${artworkUrl ? ' +art' : ''}`,
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
      sourceProvider: provider,
      title: seed?.title ?? '',
      artist: seed?.artist ?? '',
    },
    deps,
  )

  if (result.transient) {
    // The iTunes anchor errored transiently (rate limit / 5xx / network). Throwing leaves
    // the row 'pending' and lets pg-boss retry with backoff; the worker only marks 'failed'
    // after the final attempt — so a rate-limited resolution is never persisted as 'resolved'
    // with its cross-links silently missing.
    throw new Error(
      `resolve: transient upstream failure for ${job.identity} [${result.notes.join(', ')}]`,
    )
  }

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
    const o = await deps.oembed(provider, job.sourceUrl)
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
