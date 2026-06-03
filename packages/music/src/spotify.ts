export interface SpotifyTrack {
  id: string
  url: string
  isrc?: string
  title: string
  artist: string
  durationMs: number
  artworkUrl?: string
}

export interface SpotifyClient {
  searchTrack(query: string): Promise<SpotifyTrack[]>
  lookupTrack(id: string): Promise<SpotifyTrack | null>
}

type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

interface SpotifyApiTrack {
  id: string
  name: string
  duration_ms: number
  external_urls?: { spotify?: string }
  external_ids?: { isrc?: string }
  artists?: { name: string }[]
  album?: { images?: { url: string }[] }
}

/** Pure: map a Spotify API track object to our normalized shape. */
export function mapSpotifyTrack(t: SpotifyApiTrack): SpotifyTrack {
  return {
    id: t.id,
    url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
    isrc: t.external_ids?.isrc,
    title: t.name,
    artist: (t.artists ?? []).map((a) => a.name).filter(Boolean).join(', '),
    durationMs: t.duration_ms,
    artworkUrl: t.album?.images?.[0]?.url,
  }
}

/** Pull the track id after a `/track/` path segment; null for album/playlist/invalid. */
export function extractSpotifyTrackId(url: string): string | null {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)
    const i = seg.indexOf('track')
    return i !== -1 ? (seg[i + 1] ?? null) : null
  } catch {
    return null
  }
}

export interface SpotifyClientOptions {
  clientId: string
  clientSecret: string
  fetchFn?: FetchLike
  now?: () => number
}

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'

export function createSpotifyClient(opts: SpotifyClientOptions): SpotifyClient {
  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  const now = opts.now ?? (() => Date.now())
  let token: string | null = null
  let expiresAt = 0

  async function getToken(): Promise<string> {
    if (token && now() < expiresAt) return token
    const auth = Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64')
    const res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) throw new Error(`spotify token ${res.status}`)
    const j = (await res.json()) as { access_token: string; expires_in: number }
    token = j.access_token
    expiresAt = now() + (j.expires_in - 60) * 1000 // refresh 60s early
    return token
  }

  async function apiGet(path: string): Promise<unknown> {
    const t = await getToken()
    const res = await fetchFn(`${API}${path}`, { headers: { Authorization: `Bearer ${t}` } })
    if (!res.ok) throw new Error(`spotify ${res.status}`)
    return res.json()
  }

  return {
    async lookupTrack(id) {
      const t = (await apiGet(`/tracks/${encodeURIComponent(id)}`)) as SpotifyApiTrack | null
      return t ? mapSpotifyTrack(t) : null
    },
    async searchTrack(query) {
      const q = query.trim()
      if (!q) return []
      const data = (await apiGet(`/search?type=track&limit=5&q=${encodeURIComponent(q)}`)) as {
        tracks?: { items?: SpotifyApiTrack[] }
      }
      return (data.tracks?.items ?? []).map(mapSpotifyTrack)
    },
  }
}
