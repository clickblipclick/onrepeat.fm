import { providerFromUrl } from '@onrepeat/core'
import { lookupTrack as itunesLookup } from './itunes'
import { fetchOembed } from './oembed'

/** A normalized track the picker can post: enough to build a jam record. */
export interface TrackCandidate {
  title: string
  artist: string
  artworkUrl?: string
  sourceUrl: string
  provider: string
  durationSec?: number
}

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Apple Music track URLs carry the song id in the `i` query param. */
function extractAppleTrackId(url: string): string | null {
  try {
    return new URL(url).searchParams.get('i')
  } catch {
    return null
  }
}

/** Split common "Artist - Title" video titles; else keep title and use author as artist. */
function splitTitleArtist(rawTitle: string, author: string | undefined): { title: string; artist: string } {
  const m = rawTitle.match(/^(.*?)\s[-–]\s(.*)$/)
  if (m) return { artist: m[1]!.trim(), title: m[2]!.trim() }
  return { title: rawTitle.trim(), artist: (author ?? '').replace(/\s*-\s*Topic$/i, '').trim() }
}

/**
 * Derive a candidate from a pasted music URL using only free, keyless endpoints:
 * Apple → iTunes lookup; Spotify/YouTube/SoundCloud → oEmbed. Returns null on an
 * unknown provider or any failure (the post form's manual entry covers that).
 */
export async function deriveTrack(
  url: string,
  opts: { fetchFn?: FetchLike } = {},
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

  const o = await fetchOembed(provider, url, { fetchFn: opts.fetchFn })
  if (!o?.title) return null
  const { title, artist } = splitTitleArtist(o.title, o.author)
  return { title, artist, artworkUrl: o.thumbnail, sourceUrl: url, provider }
}
