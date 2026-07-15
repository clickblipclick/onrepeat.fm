/** Per-provider playback references for a resolved track, keyed by provider slug.
 *  Persisted as jsonb on tracks (see @onrepeat/db) and produced by @onrepeat/music. */
export interface ProviderRefs {
  [provider: string]: {
    url: string
    trackUri?: string
    videoId?: string
    songId?: string
    trackId?: string
    embeddable?: boolean
  }
}

export type ProviderTier = 'cross-resolvable' | 'self-contained'

/** Providers that are self-contained (not cross-resolvable) — play via their own embed. */
const SELF_CONTAINED = new Set(['bandcamp'])

export function providerTier(provider: string): ProviderTier {
  const p = provider.trim().toLowerCase()
  return SELF_CONTAINED.has(p) ? 'self-contained' : 'cross-resolvable'
}

/** Cross-resolution targets: providers the resolver links onto jams from OTHER
 *  sources (@onrepeat/music resolve-track: the iTunes/Apple anchor + YouTube
 *  search). Any provider not in this set only ever appears as a jam's own
 *  source ref — keep in sync with resolve-track when adding a target. */
export const CROSS_RESOLVED_PROVIDERS: ReadonlySet<string> = new Set([
  'applemusic',
  'youtube',
])

/** Best-effort detection of the source provider from a track URL. */
export function providerFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const host = parsed.hostname.toLowerCase()
  // exact host or a dot-anchored subdomain (so "evilspotify.com" does not match "spotify.com")
  const matches = (domain: string) =>
    host === domain || host.endsWith('.' + domain)

  if (host === 'music.youtube.com') return 'youtubemusic'
  if (host === 'youtu.be' || matches('youtube.com')) return 'youtube'
  if (matches('spotify.com')) return 'spotify'
  if (matches('music.apple.com')) return 'applemusic'
  if (matches('bandcamp.com')) return 'bandcamp'
  if (matches('soundcloud.com')) return 'soundcloud'
  if (matches('tidal.com')) return 'tidal'
  if (matches('deezer.com')) return 'deezer'
  return null
}
