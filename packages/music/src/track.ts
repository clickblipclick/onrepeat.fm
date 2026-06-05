import { providerFromUrl } from '@onrepeat/core'
import { lookupTrack as itunesLookup } from './itunes'
import { fetchOembed } from './oembed'
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
 * Apple → iTunes lookup; Spotify/YouTube/SoundCloud → oEmbed. Returns null on an
 * unknown provider or any failure (the post form's manual entry covers that).
 */
export async function deriveTrack(
  url: string,
  opts: DeriveTrackOptions = {},
): Promise<TrackCandidate | null> {
  const provider = providerFromUrl(url)
  if (!provider) return null

  if (provider === 'applemusic') {
    const id = extractAppleTrackId(url)
    if (!id) return null
    try {
      return await itunesLookup(id, { fetchFn: opts.fetchFn })
    } catch {
      return null
    }
  }

  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  const o = await fetchOembed(provider, url, { fetchFn })
  if (!o?.title) return null
  if (provider === 'spotify') {
    const artist = await fetchSpotifyArtist(url, fetchFn)
    return {
      title: o.title.trim(),
      artist,
      artworkUrl: o.thumbnail,
      sourceUrl: url,
      provider,
    }
  }
  const { title, artist } = splitTitleArtist(o.title, o.author)
  const candidate: TrackCandidate = {
    title,
    artist,
    artworkUrl: o.thumbnail,
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
  return candidate
}
