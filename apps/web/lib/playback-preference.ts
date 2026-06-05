/**
 * The "preferred playback service" cookie contract — a single, framework-free
 * source of truth shared by the server reader (`playback-preference.server.ts`,
 * which adds `next/headers`) and the client read/write helpers below.
 *
 * Logged-in users who have their music service open in the same browser get full
 * tracks (not 30s previews) when the embed is that service, so we remember which
 * service to default to. The value is non-sensitive (one of a small enum), so the
 * cookie is intentionally NOT httpOnly — the in-player switcher writes it directly.
 */

export const PLAYBACK_PREF_COOKIE = 'onrepeat_playback'

/** One year, in seconds. */
export const PLAYBACK_PREF_MAX_AGE = 365 * 24 * 60 * 60

/**
 * The logical services a user can prefer. `youtubemusic` is deliberately absent:
 * it shares YouTube's embed, so it's folded into `youtube` (see `parseProvider`).
 */
export const VALID_PROVIDERS = [
  'spotify',
  'youtube',
  'applemusic',
  'soundcloud',
] as const
export type PlaybackProvider = (typeof VALID_PROVIDERS)[number]

const VALID = new Set<string>(VALID_PROVIDERS)

/** Validate a raw cookie/click value into a logical provider, or null. Folds the
 *  youtubemusic alias into youtube and ignores anything unknown (junk/tampered). */
export function parseProvider(
  raw: string | undefined | null,
): PlaybackProvider | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  const normalized = v === 'youtubemusic' ? 'youtube' : v
  return VALID.has(normalized) ? (normalized as PlaybackProvider) : null
}

/** Build the `document.cookie` / Set-Cookie string for the preference. */
export function playbackCookieString(
  provider: PlaybackProvider,
  secure: boolean,
): string {
  const attrs = [
    `${PLAYBACK_PREF_COOKIE}=${encodeURIComponent(provider)}`,
    'Path=/',
    `Max-Age=${PLAYBACK_PREF_MAX_AGE}`,
    'SameSite=Lax',
  ]
  if (secure) attrs.push('Secure')
  return attrs.join('; ')
}

/** Read + validate the preference from `document.cookie`. Returns null on the
 *  server (no `document`) or when unset/invalid. Used by client-rendered cards. */
export function readPreferredProviderClient(): PlaybackProvider | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${PLAYBACK_PREF_COOKIE}=`))
  if (!match) return null
  return parseProvider(decodeURIComponent(match.slice(match.indexOf('=') + 1)))
}
