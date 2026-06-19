import { failureReason, type FetchResult } from './http'

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

type Oembed = { title?: string; author?: string; thumbnail?: string }

/** oEmbed fetch that distinguishes transient (network/5xx/429) from unreadable (4xx/empty). */
export async function fetchOembedResult(
  provider: string,
  url: string,
  opts: { fetchFn?: FetchLike; timeoutMs?: number } = {},
): Promise<FetchResult<Oembed>> {
  const endpoint = OEMBED_ENDPOINTS[provider]
  if (!endpoint) return { ok: false, reason: 'unreadable' }
  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await fetchFn(
      `${endpoint}?format=json&url=${encodeURIComponent(url)}`,
      {
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      },
    )
  } catch {
    return { ok: false, reason: 'transient' }
  }
  if (!res.ok) return { ok: false, reason: failureReason(res.status) }
  let j: OembedBody
  try {
    j = (await res.json()) as OembedBody
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  return {
    ok: true,
    data: { title: j.title, author: j.author_name, thumbnail: j.thumbnail_url },
  }
}

/** Best-effort oEmbed fetch. Returns null for unsupported providers or any failure. */
export async function fetchOembed(
  provider: string,
  url: string,
  opts: { fetchFn?: FetchLike; timeoutMs?: number } = {},
): Promise<{ title?: string; author?: string; thumbnail?: string } | null> {
  const r = await fetchOembedResult(provider, url, opts)
  return r.ok ? r.data : null
}
