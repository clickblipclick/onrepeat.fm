type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; redirect?: 'follow' | 'error' | 'manual' },
) => Promise<{
  ok: boolean
  status: number
  text(): Promise<string>
  /** Present on real fetch; absent on lightweight test doubles. */
  body?: ReadableStream<Uint8Array> | null
}>

export type BandcampMeta = { trackId?: string; artworkUrl?: string }
export type BandcampFetcher = (url: string) => Promise<BandcampMeta | null>

/** Cap on the scraped HTML we'll buffer — Bandcamp track pages are ~100–200 KB. */
const MAX_HTML_BYTES = 1024 * 1024

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

/**
 * Read a response body as text, aborting once it exceeds `maxBytes`. Without a cap, a
 * hostile host could stream an unbounded response and OOM the single resolver worker
 * (the 8s timeout bounds duration, not volume). Test doubles omit `body` and just
 * resolve `text()` — fine, their payloads are small and trusted.
 */
async function readTextCapped(
  res: {
    text(): Promise<string>
    body?: ReadableStream<Uint8Array> | null
  },
  maxBytes: number,
): Promise<string | null> {
  if (!res.body) return res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(out)
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
      // The host allowlist above only covers the first hop. `redirect: 'error'` makes a
      // cross-host (or any) redirect throw rather than be followed, so an open redirect on
      // a bandcamp page can't bounce this fetch to an internal/metadata endpoint. Canonical
      // track URLs are served 200 directly; a rare legit redirect just soft-fails to manual.
      redirect: 'error',
    })
    if (!res.ok) return null
    const html = await readTextCapped(res, MAX_HTML_BYTES)
    if (html == null) return null
    const trackId = parseBandcampEmbedId(html) ?? undefined
    const artworkUrl = parseBandcampArtwork(html) ?? undefined
    if (!trackId && !artworkUrl) return null
    return { trackId, artworkUrl }
  } catch {
    return null
  }
}
