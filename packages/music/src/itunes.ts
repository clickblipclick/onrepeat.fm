import { providerFromUrl } from '@onrepeat/core'
import type { TrackCandidate } from './track'
import { createRateLimiter, type RateLimiter } from './rate-limit'

const passthrough: RateLimiter = (fn) => fn()

interface ItunesResult {
  trackName?: string
  artistName?: string
  artworkUrl100?: string
  trackViewUrl?: string
  trackTimeMillis?: number
}
interface ItunesBody {
  resultCount?: number
  results?: ItunesResult[]
}

/** iTunes serves 100x100 art; swap the size token for a crisper ~300px image. */
function upsizeArt(url: string | undefined): string | undefined {
  return url?.replace('100x100bb', '300x300bb')
}

/** Pure: map an iTunes Search response to track candidates (drops malformed rows). */
export function mapItunes(body: ItunesBody): TrackCandidate[] {
  const out: TrackCandidate[] = []
  for (const r of body.results ?? []) {
    if (!r.trackName || !r.artistName || !r.trackViewUrl) continue
    out.push({
      title: r.trackName,
      artist: r.artistName,
      artworkUrl: upsizeArt(r.artworkUrl100),
      sourceUrl: r.trackViewUrl,
      provider: providerFromUrl(r.trackViewUrl) ?? 'applemusic',
      durationSec:
        r.trackTimeMillis != null
          ? Math.round(r.trackTimeMillis / 1000)
          : undefined,
    })
  }
  return out
}

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export interface SearchOptions {
  fetchFn?: FetchLike
  limit?: number
  timeoutMs?: number
  /**
   * Client-only: minimum gap between requests (ms). Set by the resolver to stay under
   * iTunes' ~20 req/min limit during backfill. Ignored by the standalone functions.
   */
  minIntervalMs?: number
}

const ENDPOINT = 'https://itunes.apple.com/search'

/** Search songs by free text. Returns [] for queries under 2 chars (no network call). */
export async function searchTracks(
  q: string,
  opts: SearchOptions = {},
): Promise<TrackCandidate[]> {
  const term = q.trim()
  if (term.length < 2) return []
  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  const limit = opts.limit ?? 6
  const timeoutMs = opts.timeoutMs ?? 8000
  const url = `${ENDPOINT}?term=${encodeURIComponent(term)}&entity=song&media=music&limit=${limit}`
  const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`itunes ${res.status}`)
  let body: ItunesBody
  try {
    body = (await res.json()) as ItunesBody
  } catch {
    throw new Error('itunes invalid-json')
  }
  return mapItunes(body)
}

const LOOKUP_ENDPOINT = 'https://itunes.apple.com/lookup'

/** Look up a single Apple/iTunes track by id (free, no auth). null on miss/failure. */
export async function lookupTrack(
  id: string,
  opts: SearchOptions = {},
): Promise<TrackCandidate | null> {
  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  const timeoutMs = opts.timeoutMs ?? 8000
  const res = await fetchFn(
    `${LOOKUP_ENDPOINT}?id=${encodeURIComponent(id)}&entity=song`,
    {
      signal: AbortSignal.timeout(timeoutMs),
    },
  )
  if (!res.ok) return null
  let body: ItunesBody
  try {
    body = (await res.json()) as ItunesBody
  } catch {
    return null
  }
  return mapItunes(body)[0] ?? null
}

/** Injectable iTunes client for the resolver (wraps the keyless search/lookup). */
export interface ItunesClient {
  search(query: string): Promise<TrackCandidate[]>
  lookup(id: string): Promise<TrackCandidate | null>
}

export function createItunesClient(opts: SearchOptions = {}): ItunesClient {
  const limit = opts.minIntervalMs
    ? createRateLimiter({ minIntervalMs: opts.minIntervalMs })
    : passthrough
  return {
    search: (query) => limit(() => searchTracks(query, opts)),
    lookup: (id) => limit(() => lookupTrack(id, opts)),
  }
}
