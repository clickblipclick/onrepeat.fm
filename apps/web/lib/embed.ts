import type { ProviderRefs } from '@onrepeat/db'

export type Embed =
  | { kind: 'iframe'; provider: string; src: string; title: string }
  | { kind: 'link'; provider: string; href: string }

/** Providers we render as an inline iframe. This map ALSO gates embeddability:
 *  `embeddableProviders` filters by `p in LABELS`, so a provider added to
 *  iframeSrc but not here is silently treated as non-embeddable. */
/** Providers we can render as an inline iframe, with the label shown on the player. */
const LABELS: Record<string, string> = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  youtubemusic: 'YouTube',
  applemusic: 'Apple Music',
  soundcloud: 'SoundCloud',
}

function iframeSrc(provider: string, url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  switch (provider) {
    case 'spotify': {
      // Pull the id after a `track` segment so locale-prefixed paths
      // (/intl-de/track/{id}) work and non-track URLs (album/playlist) return null.
      const segments = u.pathname.split('/').filter(Boolean)
      const trackIdx = segments.indexOf('track')
      const id = trackIdx !== -1 ? segments[trackIdx + 1] : undefined
      return id ? `https://open.spotify.com/embed/track/${id}` : null
    }
    case 'youtube':
    case 'youtubemusic': {
      const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v')
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    case 'applemusic':
      // music.apple.com/... -> embed.music.apple.com/... (same path)
      return `https://embed.music.apple.com${u.pathname}${u.search}`
    case 'soundcloud':
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`
    default:
      return null
  }
}

/** Resolved providers (in `refs`) that we can embed as an iframe. Stable insertion order. */
export function embeddableProviders(refs: ProviderRefs): string[] {
  return Object.keys(refs).filter((p) => p in LABELS && iframeSrc(p, refs[p]?.url ?? '') !== null)
}

/**
 * Resolve a preferred (logical) provider to the actual ref key to embed for this
 * jam, or null if it can't be honored here. `youtube` matches either a `youtube`
 * or `youtubemusic` ref (they share an embed); unknown/non-embeddable or
 * not-present-in-refs preferences return null so callers fall back gracefully.
 */
export function resolvePreferredKey(preferred: string | null | undefined, refs: ProviderRefs): string | null {
  if (!preferred) return null
  if (preferred === 'youtube' || preferred === 'youtubemusic') {
    if (refs.youtube?.url) return 'youtube'
    if (refs.youtubemusic?.url) return 'youtubemusic'
    return null
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
  if (sourceProvider && !candidates.includes(sourceProvider)) candidates.push(sourceProvider)
  for (const p of embeddableProviders(refs)) if (!candidates.includes(p)) candidates.push(p)

  for (const provider of candidates) {
    const url = refs[provider]?.url ?? (provider === sourceProvider ? sourceUrl : undefined)
    if (!url) continue
    const src = iframeSrc(provider, url)
    if (src) return { kind: 'iframe', provider, src, title: `${LABELS[provider]} player` }
  }
  // Defense-in-depth: never emit a non-http(s) href (e.g. a javascript: URL).
  const href = /^https?:\/\//i.test(sourceUrl) ? sourceUrl : '#'
  return { kind: 'link', provider: sourceProvider ?? 'source', href }
}
