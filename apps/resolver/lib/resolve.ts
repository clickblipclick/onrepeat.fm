import type { Updateable } from 'kysely'

import { providerFromUrl, providerTier } from '@onrepeat/core'
import { markTrackFailed, type DB, type TracksTable } from '@onrepeat/db'
import { resolveLog, type ResolveJob } from '@onrepeat/jobs'
import {
  extractTidalTrackId,
  resolveTrack,
  type BandcampFetcher,
  type ResolveDeps,
  type TidalFetcher,
} from '@onrepeat/music'

/** Source-cover fetcher (Spotify/YouTube/SoundCloud oEmbed); used as an artwork fallback. */
export type OembedFetcher = (
  provider: string,
  url: string,
) => Promise<{ thumbnail?: string } | null>

export type ResolverDeps = ResolveDeps & {
  bandcamp?: BandcampFetcher
  oembed?: OembedFetcher
  /** Tidal track-page scrape (og:image) — the artwork fallback of last resort for
   *  tidal-source jams, whose oEmbed carries no thumbnail. Keyless, like bandcamp. */
  tidal?: TidalFetcher
  /**
   * Persist a provider artwork URL to our own CDN, returning the CDN URL (or null on
   * failure / when unconfigured). Injected so the worker owns the R2 store; absent in
   * tests and when R2 env is unset (art then stays hotlinked).
   */
  persistArtwork?: (artworkUrl: string) => Promise<string | null>
}

/**
 * Apply a resolution update to a track row, warning if it matched nothing. A job whose
 * identity is no longer in `tracks` — the track was deleted, or was never seeded by the
 * producer — would otherwise no-op silently and the resolution would vanish without a trace.
 */
async function applyTrackUpdate(
  db: DB,
  identity: string,
  update: Updateable<TracksTable>,
): Promise<void> {
  const res = await db
    .updateTable('tracks')
    .set(update)
    .where('id', '=', identity)
    .execute()
  if ((res[0]?.numUpdatedRows ?? 0n) === 0n)
    resolveLog(
      'skip',
      identity,
      'track row missing — resolution update dropped',
    )
}

/**
 * If artwork persistence is configured and this update sets an `artwork_url`, copy that
 * image to our CDN and mirror the result in `cdn_artwork_url`: set it on success, clear it
 * to null on failure. Best-effort — a null result (fetch/upload failure, untrusted host, or
 * no store) leaves the row hotlinking the freshly (re)written provider URL rather than a
 * stale CDN object from a previous cover.
 */
async function withCdnArtwork(
  deps: ResolverDeps,
  update: Updateable<TracksTable>,
): Promise<void> {
  const url = update.artwork_url
  if (!deps.persistArtwork || typeof url !== 'string' || !url) return
  const cdn = await deps.persistArtwork(url)
  // Keep cdn_artwork_url in lockstep with the (re)written artwork_url: set it on success,
  // clear it on failure so reads fall back to the fresh provider URL instead of a stale
  // CDN object from a previous cover.
  update.cdn_artwork_url = cdn ?? null
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
    await markTrackFailed(db, job.identity)
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
    await withCdnArtwork(deps, update)
    await applyTrackUpdate(db, job.identity, update)
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

  // Tidal's oEmbed has no thumbnail, so the chain above can end empty for a
  // tidal-source jam that missed on iTunes and wasn't posted through our picker
  // (no seeded raw art). Last resort: scrape the track page's og:image.
  if (!artworkUrl && provider === 'tidal' && deps.tidal) {
    const id = extractTidalTrackId(job.sourceUrl)
    const meta = id ? await deps.tidal(id) : null
    if (meta?.artworkUrl) {
      artworkUrl = meta.artworkUrl
      artSource = 'tidal'
    }
  }
  if (artworkUrl) update.artwork_url = artworkUrl

  await withCdnArtwork(deps, update)
  await applyTrackUpdate(db, job.identity, update)
  resolveLog(
    'resolved',
    job.identity,
    `[${Object.keys(result.providerRefs).join(', ')}]`,
    `art:${artSource}`,
    '·',
    ...result.notes,
  )
}
