type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export type BandcampFetcher = (url: string) => Promise<{ trackId: string } | null>

/** Pure: pull the EmbeddedPlayer track id out of a Bandcamp track page's HTML. */
export function parseBandcampEmbedId(html: string): string | null {
  const m = /EmbeddedPlayer\/[^"']*track=(\d+)/.exec(html)
  return m ? m[1]! : null
}

/** Fetch a Bandcamp track page and extract its embed track id. null on any failure. */
export async function fetchBandcampEmbed(
  url: string,
  opts: { fetchFn?: FetchLike; timeoutMs?: number } = {},
): Promise<{ trackId: string } | null> {
  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 8000) })
    if (!res.ok) return null
    const id = parseBandcampEmbedId(await res.text())
    return id ? { trackId: id } : null
  } catch {
    return null
  }
}
