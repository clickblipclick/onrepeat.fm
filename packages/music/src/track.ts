import { providerFromUrl } from '@onrepeat/core'

import { parseBandcampArtwork, parseBandcampTitleArtist } from './bandcamp'
import { decodeEntities, MAX_HTML_BYTES, metaContent } from './html'
import { failureReason, readTextCapped, type FetchLike } from './http'
import { lookupTrackResult } from './itunes'
import { fetchOembedResult } from './oembed'
import { youtubeVideoId } from './youtube'

/** A normalized track the picker can post: enough to build a jam record. */
export interface TrackCandidate {
  title: string
  artist: string
  artworkUrl?: string
  sourceUrl: string
  provider: string
  durationSec?: number
  /** false only when we positively determined the source isn't music (a non-Music
   *  YouTube video); undefined when unknown or unchecked. Callers warn only on false. */
  isLikelyMusic?: boolean
}

/** Outcome of deriving a track from a pasted link. */
export type DeriveResult =
  | { ok: true; candidate: TrackCandidate }
  | { ok: false; reason: 'unknown-host' | 'transient' | 'unreadable' }

export interface DeriveTrackOptions {
  fetchFn?: FetchLike
  /** Optional classifier for plain youtube.com videos: given a video id, resolves
   *  true (music) / false (not music) / null (undeterminable). Only called for
   *  provider 'youtube' on urls that carry a video id. */
  classifyYoutubeMusic?: (videoId: string) => Promise<boolean | null>
}

/**
 * Apple Music exposes a track id two ways: album-track URLs carry it in the `i` query
 * param (…/album/<slug>/<albumId>?i=<trackId>); direct-song URLs carry it as the last
 * path segment (…/song/<slug>/<trackId>, or …/song/<trackId>). Prefer `i`, else read the
 * trailing numeric id of a /song/ path. Restricted to /song/ so an album URL's <albumId>
 * is never mistaken for a track id. Shared with the resolver so both accept the same URLs.
 */
export function extractAppleTrackId(url: string): string | null {
  try {
    const u = new URL(url)
    const i = u.searchParams.get('i')
    if (i) return i
    const segs = u.pathname.split('/').filter(Boolean)
    if (segs.includes('song')) {
      const last = segs[segs.length - 1]
      if (last && /^\d+$/.test(last)) return last
    }
    return null
  } catch {
    return null
  }
}

/** Spotify oEmbed gives the title but not the artist; the track page exposes the
 *  artist in a `music:musician_description` meta tag (fallback: og:description). */
async function fetchSpotifyArtist(
  url: string,
  fetchFn: FetchLike,
): Promise<string> {
  try {
    const res = await fetchFn(url, {
      signal: AbortSignal.timeout(8000),
      // The caller already constrained the host to spotify.com via providerFromUrl, but
      // that only covers the first hop. `redirect: 'error'` makes an open redirect on the
      // track page throw rather than bounce this fetch to an internal/metadata endpoint.
      redirect: 'error',
    })
    if (!res.ok) return ''
    const html = await readTextCapped(res, MAX_HTML_BYTES)
    if (html == null) return ''
    const musician = metaContent(html, 'music:musician_description')
    if (musician?.trim()) return decodeEntities(musician.trim())
    // Fallback: og:description opens with "Artist · Song · Year"; only trust it
    // when that "·"-delimited shape is present.
    const desc = metaContent(html, 'og:description')
    const dot = desc?.indexOf('·') ?? -1
    if (desc && dot > 0) return decodeEntities(desc.slice(0, dot).trim())
    return ''
  } catch {
    return ''
  }
}

/** Normalize an oEmbed title+author into title/artist. Strips SoundCloud's
 *  redundant " by <author>" title suffix, then splits "Artist - Title" (common on
 *  YouTube). */
function splitTitleArtist(
  rawTitle: string,
  author: string | undefined,
): { title: string; artist: string } {
  const author_ = (author ?? '').replace(/\s*-\s*Topic$/i, '').trim()
  let title = rawTitle.trim()
  // SoundCloud's oEmbed title is "Track Title by <author>" while author_name is set
  // separately, so the title would otherwise read "[title] by [artist]". Match the
  // author exactly (not any " by …") so a legitimate "by" in the title is preserved,
  // and strip BEFORE the dash split so it also fires on "Artist - Title by <author>".
  const suffix = ` by ${author_}`
  if (author_ && title.toLowerCase().endsWith(suffix.toLowerCase())) {
    title = title.slice(0, -suffix.length).trim()
  }
  const m = title.match(/^(.*?)\s[-–]\s(.*)$/)
  if (m) return { artist: m[1]!.trim(), title: m[2]!.trim() }
  return { title, artist: author_ }
}

/**
 * Derive a candidate from a pasted music URL using only free, keyless endpoints:
 * Apple → iTunes lookup; Spotify/YouTube/SoundCloud → oEmbed; Bandcamp → page scrape.
 * Returns a discriminated result: an unknown host, a retryable transient failure, an
 * unreadable link (no metadata), or the candidate. The picker reacts per reason.
 */
export async function deriveTrack(
  url: string,
  opts: DeriveTrackOptions = {},
): Promise<DeriveResult> {
  const provider = providerFromUrl(url)
  if (!provider) return { ok: false, reason: 'unknown-host' }

  if (provider === 'applemusic') {
    const id = extractAppleTrackId(url)
    if (!id) return { ok: false, reason: 'unreadable' }
    const r = await lookupTrackResult(id, { fetchFn: opts.fetchFn })
    return r.ok ? { ok: true, candidate: r.data } : r
  }

  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)

  if (provider === 'bandcamp') {
    // Bandcamp has no oEmbed; scrape the track page's og: meta (same source the
    // resolver reads). No ", by" shape ⇒ unreadable. Same scrape hardening as
    // fetchBandcampEmbed/fetchSpotifyArtist: `redirect: 'error'` so an open redirect
    // can't bounce this server-side fetch off the bandcamp host providerFromUrl
    // checked, and a capped read so a hostile page can't OOM the process.
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await fetchFn(url, {
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      })
    } catch {
      return { ok: false, reason: 'transient' }
    }
    if (!res.ok) return { ok: false, reason: failureReason(res.status) }
    const html = await readTextCapped(res, MAX_HTML_BYTES)
    if (html == null) return { ok: false, reason: 'unreadable' }
    const ta = parseBandcampTitleArtist(html)
    if (!ta) return { ok: false, reason: 'unreadable' }
    return {
      ok: true,
      candidate: {
        title: ta.title,
        artist: ta.artist,
        artworkUrl: parseBandcampArtwork(html) ?? undefined,
        sourceUrl: url,
        provider,
      },
    }
  }

  const o = await fetchOembedResult(provider, url, { fetchFn })
  if (!o.ok) return o
  if (!o.data.title) return { ok: false, reason: 'unreadable' }

  if (provider === 'spotify') {
    // oEmbed gives title+art but not artist; scrape the track page for it. A failed
    // artist scrape alone is not fatal — keep an empty artist (the user can edit).
    const artist = await fetchSpotifyArtist(url, fetchFn)
    return {
      ok: true,
      candidate: {
        title: o.data.title.trim(),
        artist,
        artworkUrl: o.data.thumbnail,
        sourceUrl: url,
        provider,
      },
    }
  }

  const { title, artist } = splitTitleArtist(o.data.title, o.data.author)
  const candidate: TrackCandidate = {
    title,
    artist,
    artworkUrl: o.data.thumbnail,
    sourceUrl: url,
    provider,
  }

  // Soft music check for plain YouTube videos (music.youtube.com is already music).
  if (provider === 'youtube' && opts.classifyYoutubeMusic) {
    const videoId = youtubeVideoId(url)
    if (videoId && (await opts.classifyYoutubeMusic(videoId)) === false) {
      candidate.isLikelyMusic = false
    }
  }
  return { ok: true, candidate }
}
