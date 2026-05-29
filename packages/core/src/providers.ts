export type ProviderTier = 'cross-resolvable' | 'self-contained'

/** Providers Odesli cannot match across services — play via their own embed. */
const SELF_CONTAINED = new Set(['bandcamp'])

export function providerTier(provider: string): ProviderTier {
  const p = provider.trim().toLowerCase()
  return SELF_CONTAINED.has(p) ? 'self-contained' : 'cross-resolvable'
}

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
  const matches = (domain: string) => host === domain || host.endsWith('.' + domain)

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
