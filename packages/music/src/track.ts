import { providerFromUrl } from '@onrepeat/core'
import { lookupTrackResult } from './itunes'
import { fetchOembedResult } from './oembed'
import { parseBandcampArtwork, parseBandcampTitleArtist } from './bandcamp'
import { youtubeVideoId } from './youtube'
import { failureReason } from './http'

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

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}>

/** Apple Music track URLs carry the song id in the `i` query param. */
function extractAppleTrackId(url: string): string | null {
  try {
    return new URL(url).searchParams.get('i')
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
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return ''
    const html = await res.text()
    const m =
      /<meta[^>]+name="music:musician_description"[^>]+content="([^"]+)"/.exec(
        html,
      ) ??
      /<meta[^>]+property="og:description"[^>]+content="([^"·]+?)\s*·/.exec(
        html,
      )
    return m ? m[1]!.trim() : ''
  } catch {
    return ''
  }
}

/** Split common "Artist - Title" video titles; else keep title and use author as artist. */
function splitTitleArtist(
  rawTitle: string,
  author: string | undefined,
): { title: string; artist: string } {
  const m = rawTitle.match(/^(.*?)\s[-–]\s(.*)$/)
  if (m) return { artist: m[1]!.trim(), title: m[2]!.trim() }
  return {
    title: rawTitle.trim(),
    artist: (author ?? '').replace(/\s*-\s*Topic$/i, '').trim(),
  }
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
    // resolver reads). No ", by" shape ⇒ unreadable.
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await fetchFn(url, { signal: AbortSignal.timeout(8000) })
    } catch {
      return { ok: false, reason: 'transient' }
    }
    if (!res.ok) return { ok: false, reason: failureReason(res.status) }
    const html = await res.text()
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
