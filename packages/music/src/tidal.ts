import { decodeEntities, metaContent } from './html'

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
