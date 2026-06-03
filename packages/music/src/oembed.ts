type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Providers with a free, no-auth oEmbed endpoint (used by deriveTrack). */
const OEMBED_ENDPOINTS: Record<string, string> = {
  spotify: 'https://open.spotify.com/oembed',
  youtube: 'https://www.youtube.com/oembed',
  youtubemusic: 'https://www.youtube.com/oembed',
  soundcloud: 'https://soundcloud.com/oembed',
}

interface OembedBody {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

/** Best-effort oEmbed fetch. Returns null for unsupported providers or any failure. */
export async function fetchOembed(
  provider: string,
  url: string,
  opts: { fetchFn?: FetchLike; timeoutMs?: number } = {},
): Promise<{ title?: string; author?: string; thumbnail?: string } | null> {
  const endpoint = OEMBED_ENDPOINTS[provider]
  if (!endpoint) return null
  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  try {
    const res = await fetchFn(`${endpoint}?format=json&url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as OembedBody
    return { title: j.title, author: j.author_name, thumbnail: j.thumbnail_url }
  } catch {
    return null
  }
}
