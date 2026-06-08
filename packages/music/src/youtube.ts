export interface YoutubeVideo {
  videoId: string
  url: string
  title: string
  channelTitle: string
  durationSec?: number
}

export interface YoutubeVideoMeta {
  durationSec?: number
  /** YouTube `status.embeddable` — false when the uploader disabled embedded playback. */
  embeddable?: boolean
}

export interface YoutubeClient {
  searchVideo(query: string): Promise<YoutubeVideo[]>
  /** Batch-fetch per-video duration + embeddability in one videos.list call. */
  lookupVideos(ids: string[]): Promise<Map<string, YoutubeVideoMeta>>
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
export function mapYoutubeSearch(body: {
  items?: SearchItem[]
}): YoutubeVideo[] {
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

/** Extract the video id from a youtube.com/youtu.be/music.youtube.com watch url; null
 *  for playlist/channel urls (no single video) or anything non-youtube. */
export function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (host === 'youtu.be') return u.pathname.slice(1) || null
    if (host === 'youtube.com' || host.endsWith('.youtube.com'))
      return u.searchParams.get('v')
    return null
  } catch {
    return null
  }
}

const API = 'https://www.googleapis.com/youtube/v3'

/** Look up a video's YouTube category id via the Data API ('10' === Music). Returns
 *  null on a blank id, a not-found video, or any error — callers treat null as "unknown". */
export async function fetchYoutubeCategory(
  videoId: string,
  opts: { apiKey: string; fetchFn?: FetchLike; timeoutMs?: number },
): Promise<string | null> {
  const id = videoId.trim()
  if (!id) return null
  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  try {
    const res = await fetchFn(
      `${API}/videos?part=snippet&id=${encodeURIComponent(id)}&key=${encodeURIComponent(opts.apiKey)}`,
      { signal: AbortSignal.timeout(opts.timeoutMs ?? 8000) },
    )
    if (!res.ok) return null
    const body = (await res.json()) as {
      items?: { snippet?: { categoryId?: string } }[]
    }
    return body.items?.[0]?.snippet?.categoryId ?? null
  } catch {
    return null
  }
}

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
    const res = await fetchFn(
      `${API}${path}${sep}key=${encodeURIComponent(opts.apiKey)}`,
      {
        signal: AbortSignal.timeout(timeoutMs),
      },
    )
    if (!res.ok) throw new Error(`youtube ${res.status}`)
    return res.json()
  }

  return {
    async searchVideo(query) {
      const q = query.trim()
      if (!q) return []
      const body = (await get(
        `/search?part=snippet&type=video&maxResults=3&q=${encodeURIComponent(q)}`,
      )) as {
        items?: SearchItem[]
      }
      return mapYoutubeSearch(body)
    },
    async lookupVideos(ids) {
      const map = new Map<string, YoutubeVideoMeta>()
      if (ids.length === 0) return map
      // videos.list caps `id` at 50 per request — chunk and merge.
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50)
        const body = (await get(
          `/videos?part=contentDetails,status&id=${chunk.map(encodeURIComponent).join(',')}`,
        )) as {
          items?: {
            id?: string
            contentDetails?: { duration?: string }
            status?: { embeddable?: boolean }
          }[]
        }
        for (const it of body.items ?? []) {
          if (!it.id) continue
          map.set(it.id, {
            durationSec: it.contentDetails?.duration
              ? parseIso8601Duration(it.contentDetails.duration)
              : undefined,
            embeddable: it.status?.embeddable,
          })
        }
      }
      return map
    },
  }
}
