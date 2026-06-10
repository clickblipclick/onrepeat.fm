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
  return metaContent(html, 'og:image')
}

/** Read a `<meta property|name="key" content="...">` value, tolerating attribute order. */
function metaContent(html: string, key: string): string | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m =
    new RegExp(
      `<meta[^>]+(?:property|name)="${k}"[^>]+content="([^"]*)"`,
      'i',
    ).exec(html) ??
    new RegExp(
      `<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${k}"`,
      'i',
    ).exec(html)
  return m ? m[1]! : null
}

/** Decode the handful of HTML entities Bandcamp emits in its meta tags. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/g, '&')
}

/** Pure: derive { title, artist } from a Bandcamp page. Its og:title is the canonical
 *  "Title, by Artist"; when that shape is absent, og:site_name carries the artist.
 *  Returns null when there's no og:title (caller falls back to manual entry). */
export function parseBandcampTitleArtist(
  html: string,
): { title: string; artist: string } | null {
  const og = metaContent(html, 'og:title')
  if (!og) return null
  // Greedy left side splits on the *last* ", by " — titles can contain " by ".
  const m = /^(.*),\s+by\s+(.+)$/.exec(og)
  if (m)
    return {
      title: decodeEntities(m[1]!.trim()),
      artist: decodeEntities(m[2]!.trim()),
    }
  const site = metaContent(html, 'og:site_name')
  return {
    title: decodeEntities(og.trim()),
    artist: site ? decodeEntities(site.trim()) : '',
  }
}

/** True iff `raw` is an https URL on bandcamp's own hosts. */
function isBandcampUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  return h === 'bandcamp.com' || h.endsWith('.bandcamp.com')
}

/** Fetch a Bandcamp track page and extract its embed track id + cover art (one request).
 *  Returns null on a failed fetch or when neither is present (soft fail). */
export async function fetchBandcampEmbed(
  url: string,
  opts: { fetchFn?: FetchLike; timeoutMs?: number } = {},
): Promise<BandcampMeta | null> {
  // Defense-in-depth (SSRF): only ever fetch bandcamp's own hosts over https, so a caller
  // that forwards an untrusted url can't aim this at an internal/metadata endpoint. The
  // resolver also re-derives the provider from the url before getting here.
  if (!isBandcampUrl(url)) return null
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
