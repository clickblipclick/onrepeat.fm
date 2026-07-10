import { decodeEntities, MAX_HTML_BYTES, metaContent } from './html'
import { readTextCapped, type TextFetchLike } from './http'

/** Pure: pull the numeric track id out of any Tidal track URL. All the shapes in the
 *  wild carry it as the path segment after "track": tidal.com/track/<id>,
 *  tidal.com/browse/track/<id>, listen.tidal.com/track/<id>, and
 *  listen.tidal.com/album/<albumId>/track/<trackId>. */
export function extractTidalTrackId(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const segments = u.pathname.split('/').filter(Boolean)
  const trackIdx = segments.indexOf('track')
  const id = trackIdx !== -1 ? segments[trackIdx + 1] : undefined
  return id && /^[1-9]\d*$/.test(id) ? id : null
}

/** The canonical track page for an id. The /browse/ and listen. URL variants 301 to
 *  this (which `redirect: 'error'` fetches would reject), so we always fetch the URL
 *  we construct — also inherently SSRF-safe: fixed host, numeric path. */
export function canonicalTidalUrl(trackId: string): string {
  return `https://tidal.com/track/${trackId}`
}

/** Pure: derive { title, artist } from a Tidal track page. Its og:title is
 *  "Artist - Title"; split on the first " - " (the same lazy-first convention
 *  deriveTrack's splitTitleArtist uses for oEmbed titles — dash-heavy titles can
 *  mis-split, and the picker's editable confirm card is the fallback). No dash ⇒
 *  whole string as title. Returns null when there's no og:title. */
export function parseTidalTitleArtist(
  html: string,
): { title: string; artist: string } | null {
  const og = metaContent(html, 'og:title')
  if (!og) return null
  const m = /^(.*?)\s[-–]\s(.*)$/.exec(og.trim())
  if (m)
    return {
      artist: decodeEntities(m[1]!.trim()),
      title: decodeEntities(m[2]!.trim()),
    }
  return { title: decodeEntities(og.trim()), artist: '' }
}

/** Pure: pull the cover art URL from a Tidal page's og:image meta. */
export function parseTidalArtwork(html: string): string | null {
  return metaContent(html, 'og:image')
}

export type TidalMeta = { title: string; artist: string; artworkUrl?: string }
export type TidalFetcher = (trackId: string) => Promise<TidalMeta | null>

/** Fetch a Tidal track page (by numeric id — see canonicalTidalUrl) and extract its
 *  og: metadata. Returns null on any failure (soft fail). Tidal's oEmbed carries no
 *  title/author/thumbnail, so this scrape is the metadata source; used by the resolver
 *  as its artwork fallback. deriveTrack does its own inline fetch of the same page so
 *  it can map failures to distinct retry reasons. */
export async function fetchTidalTrack(
  trackId: string,
  opts: { fetchFn?: TextFetchLike; timeoutMs?: number } = {},
): Promise<TidalMeta | null> {
  // Belt-and-braces: the id interpolates into a URL, so never accept a non-numeric one
  // even though callers extract it with extractTidalTrackId.
  if (!/^[1-9]\d*$/.test(trackId)) return null
  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as TextFetchLike)
  try {
    const res = await fetchFn(canonicalTidalUrl(trackId), {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      // Canonical track pages serve 200 directly; any redirect is unexpected — throw
      // rather than follow (same hardening as the other scrapers in this package).
      redirect: 'error',
    })
    if (!res.ok) return null
    const html = await readTextCapped(res, MAX_HTML_BYTES)
    if (html == null) return null
    const ta = parseTidalTitleArtist(html)
    if (!ta) return null
    const artworkUrl = parseTidalArtwork(html) ?? undefined
    return artworkUrl ? { ...ta, artworkUrl } : { ...ta }
  } catch {
    return null
  }
}
