export type ProviderTier = 'cross-resolvable' | 'self-contained'

/** Providers Odesli cannot match across services — play via their own embed. */
const SELF_CONTAINED = new Set(['bandcamp'])

export function providerTier(provider: string): ProviderTier {
  const p = provider.trim().toLowerCase()
  return SELF_CONTAINED.has(p) ? 'self-contained' : 'cross-resolvable'
}

/** Best-effort detection of the source provider from a track URL. */
export function providerFromUrl(url: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  if (host === 'music.youtube.com') return 'youtubemusic'
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube'
  if (host.endsWith('spotify.com')) return 'spotify'
  if (host === 'music.apple.com' || host.endsWith('.music.apple.com')) return 'applemusic'
  if (host.endsWith('bandcamp.com')) return 'bandcamp'
  if (host.endsWith('soundcloud.com')) return 'soundcloud'
  if (host.endsWith('tidal.com')) return 'tidal'
  if (host.endsWith('deezer.com')) return 'deezer'
  return null
}
