type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export type BandcampMeta = { trackId?: string; artworkUrl?: string }
export type BandcampFetcher = (url: string) => Promise<BandcampMeta | null>

/** Pure: pull the EmbeddedPlayer track id out of a Bandcamp track page's HTML. */
export function parseBandcampEmbedId(html: string): string | null {
  const m = /EmbeddedPlayer\/[^"']*track=(\d+)/.exec(html)
  return m ? m[1]! : null
}

/** Pure: pull the cover art URL from a Bandcamp page's og:image meta (either attr order). */
export function parseBandcampArtwork(html: string): string | null {
  const m =
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html) ??
    /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/.exec(html)
  return m ? m[1]! : null
}

/** Fetch a Bandcamp track page and extract its embed track id + cover art (one request).
 *  Returns null on a failed fetch or when neither is present (soft fail). */
export async function fetchBandcampEmbed(
  url: string,
  opts: { fetchFn?: FetchLike; timeoutMs?: number } = {},
): Promise<BandcampMeta | null> {
  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  try {
    const res = await fetchFn(url, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const trackId = parseBandcampEmbedId(html) ?? undefined
    const artworkUrl = parseBandcampArtwork(html) ?? undefined
    if (!trackId && !artworkUrl) return null
    return { trackId, artworkUrl }
  } catch {
    return null
  }
}
