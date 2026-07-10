import type { ProviderRefs } from '@onrepeat/db'

export type Embed =
  | {
      kind: 'iframe'
      provider: string
      src: string
      title: string
      /** YouTube only: the video id (the IFrame API player is built from it). Carried on
       *  the model so consumers never re-parse it out of `src`. */
      videoId?: string
      /** The provider's user-facing page for this track — the link-out target when the
       *  embed fails to load (blocked host, dead track). */
      fallbackHref?: string
    }
  | { kind: 'link'; provider: string; href: string }

/** Providers we render as an inline iframe. This map ALSO gates embeddability:
 *  `embeddableProviders` filters by `p in LABELS`, so a provider added to
 *  iframeSrc but not here is silently treated as non-embeddable. */
/** Providers we can render as an inline iframe, with the label shown on the player. */
export const LABELS: Record<string, string> = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  youtubemusic: 'YouTube',
  applemusic: 'Apple Music',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp',
  tidal: 'TIDAL',
}

type RefEntry = { url?: string; trackId?: string; embeddable?: boolean }

/** Only ever link out to http(s) — never e.g. a javascript: URL. */
function safeHttpUrl(url: string | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined
}

function iframeSrc(
  provider: string,
  ref: RefEntry | undefined,
): { src: string; videoId?: string } | null {
  if (provider === 'bandcamp') {
    // size=large + artwork=small → the compact ~120px horizontal player (art thumb + controls),
    // consistent with the Spotify/Apple bars rather than the tall square.
    return ref?.trackId
      ? {
          src: `https://bandcamp.com/EmbeddedPlayer/track=${ref.trackId}/size=large/bgcol=ffffff/linkcol=0687f5/tracklist=false/artwork=small/transparent=true/`,
        }
      : null
  }
  const url = ref?.url
  if (!url) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  switch (provider) {
    case 'spotify': {
      const segments = u.pathname.split('/').filter(Boolean)
      const trackIdx = segments.indexOf('track')
      const id = trackIdx !== -1 ? segments[trackIdx + 1] : undefined
      return id ? { src: `https://open.spotify.com/embed/track/${id}` } : null
    }
    case 'tidal': {
      // Every Tidal URL shape carries the numeric track id after a "track" path
      // segment (/track/<id>, /browse/track/<id>, /album/<aid>/track/<id>).
      // Anonymous visitors get a preview + sign-up prompt; Tidal subscribers get
      // the full track — same class of embed as Spotify.
      const segments = u.pathname.split('/').filter(Boolean)
      const trackIdx = segments.indexOf('track')
      const id = trackIdx !== -1 ? segments[trackIdx + 1] : undefined
      return id && /^[1-9]\d*$/.test(id)
        ? { src: `https://embed.tidal.com/tracks/${id}` }
        : null
    }
    case 'youtube':
    case 'youtubemusic': {
      if (ref?.embeddable === false) return null // uploader disabled embedding → link-out
      const id =
        u.hostname === 'youtu.be'
          ? u.pathname.slice(1)
          : u.searchParams.get('v')
      return id
        ? { src: `https://www.youtube.com/embed/${id}`, videoId: id }
        : null
    }
    case 'applemusic':
      return { src: `https://embed.music.apple.com${u.pathname}${u.search}` }
    case 'soundcloud':
      return {
        src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`,
      }
    default:
      return null
  }
}

/** Resolved providers (in `refs`) that we can embed as an iframe. Stable insertion order. */
export function embeddableProviders(refs: ProviderRefs): string[] {
  return Object.keys(refs).filter(
    (p) => p in LABELS && iframeSrc(p, refs[p]) !== null,
  )
}

/**
 * Resolve a preferred (logical) provider to the actual ref key to embed for this
 * jam, or null if it can't be honored here. `youtube` matches either a `youtube`
 * or `youtubemusic` ref (they share an embed); unknown/non-embeddable or
 * not-present-in-refs preferences return null so callers fall back gracefully.
 */
export function resolvePreferredKey(
  preferred: string | null | undefined,
  refs: ProviderRefs,
): string | null {
  if (!preferred) return null
  if (preferred === 'youtube' || preferred === 'youtubemusic') {
    if (refs.youtube?.url && refs.youtube.embeddable !== false) return 'youtube'
    if (refs.youtubemusic?.url && refs.youtubemusic.embeddable !== false)
      return 'youtubemusic'
    return null
  }
  if (preferred === 'bandcamp') {
    return refs.bandcamp?.trackId ? 'bandcamp' : null
  }
  return preferred in LABELS && refs[preferred]?.url ? preferred : null
}

/**
 * Pick a player for a jam: the user's preferred service (if available + embeddable
 * for this jam), else the source provider if embeddable, else the first embeddable
 * resolved ref, else a link-out to the source url.
 */
export function buildEmbed(
  sourceProvider: string | null,
  refs: ProviderRefs,
  sourceUrl: string,
  preferred?: string | null,
): Embed {
  const candidates: string[] = []
  const pref = resolvePreferredKey(preferred, refs)
  if (pref) candidates.push(pref)
  if (sourceProvider && !candidates.includes(sourceProvider))
    candidates.push(sourceProvider)
  for (const p of embeddableProviders(refs))
    if (!candidates.includes(p)) candidates.push(p)

  for (const provider of candidates) {
    const ref =
      refs[provider] ??
      (provider === sourceProvider ? { url: sourceUrl } : undefined)
    const framed = iframeSrc(provider, ref)
    if (framed)
      return {
        kind: 'iframe',
        provider,
        ...framed,
        title: `${LABELS[provider]} player`,
        fallbackHref: safeHttpUrl(ref?.url),
      }
  }
  return {
    kind: 'link',
    provider: sourceProvider ?? 'source',
    href: safeHttpUrl(sourceUrl) ?? '#',
  }
}
