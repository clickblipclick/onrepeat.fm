export interface YoutubeVideo {
  videoId: string
  url: string
  title: string
  channelTitle: string
  durationSec?: number
}

export interface YoutubeClient {
  searchVideo(query: string): Promise<YoutubeVideo[]>
  lookupDurations(ids: string[]): Promise<Map<string, number>>
}

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Parse an ISO-8601 duration (e.g. "PT3M21S") to whole seconds; 0 if unparseable. */
export function parseIso8601Duration(d: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d)
  if (!m) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

interface SearchItem {
  id?: { videoId?: string }
  snippet?: { title?: string; channelTitle?: string }
}

/** Pure: map a search.list response to videos (drops items without a videoId). */
export function mapYoutubeSearch(body: { items?: SearchItem[] }): YoutubeVideo[] {
  const out: YoutubeVideo[] = []
  for (const it of body.items ?? []) {
    const videoId = it.id?.videoId
    if (!videoId) continue
    out.push({
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: it.snippet?.title ?? '',
      channelTitle: it.snippet?.channelTitle ?? '',
    })
  }
  return out
}

const API = 'https://www.googleapis.com/youtube/v3'

export interface YoutubeClientOptions {
  apiKey: string
  fetchFn?: FetchLike
  timeoutMs?: number
}

export function createYoutubeClient(opts: YoutubeClientOptions): YoutubeClient {
  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  const timeoutMs = opts.timeoutMs ?? 8000

  async function get(path: string): Promise<unknown> {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetchFn(`${API}${path}${sep}key=${encodeURIComponent(opts.apiKey)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`youtube ${res.status}`)
    return res.json()
  }

  return {
    async searchVideo(query) {
      const q = query.trim()
      if (!q) return []
      const body = (await get(`/search?part=snippet&type=video&maxResults=3&q=${encodeURIComponent(q)}`)) as {
        items?: SearchItem[]
      }
      return mapYoutubeSearch(body)
    },
    async lookupDurations(ids) {
      const map = new Map<string, number>()
      if (ids.length === 0) return map
      const body = (await get(`/videos?part=contentDetails&id=${ids.map(encodeURIComponent).join(',')}`)) as {
        items?: { id?: string; contentDetails?: { duration?: string } }[]
      }
      for (const it of body.items ?? []) {
        if (it.id && it.contentDetails?.duration) map.set(it.id, parseIso8601Duration(it.contentDetails.duration))
      }
      return map
    },
  }
}
