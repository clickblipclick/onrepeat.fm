/**
 * The display-mode cookie contract — a single, framework-free source of truth
 * shared by the server reader (`mode-preference.server.ts`, which adds
 * `next/headers`) and the client helpers below.
 *
 * `light` / `dark` pin a mode; the *absence* of the cookie means "system"
 * (follow prefers-color-scheme), so visitors who never touch the toggle keep
 * the default behavior. The value is non-sensitive (one of a small enum), so
 * the cookie is intentionally NOT httpOnly — the toggle writes it directly.
 */

export const MODE_PREF_COOKIE = 'onrepeat_mode'

/** One year, in seconds. */
export const MODE_PREF_MAX_AGE = 365 * 24 * 60 * 60

/** Modes that can be pinned via the cookie; 'system' is the cookie's absence. */
export const PINNED_MODES = ['light', 'dark'] as const
export type PinnedMode = (typeof PINNED_MODES)[number]

/** What the toggle UI offers. */
export type DisplayMode = PinnedMode | 'system'

const VALID = new Set<string>(PINNED_MODES)

/** Validate a raw cookie value into a pinned mode, or null (= system) for
 *  anything unknown (junk/tampered). */
export function parseMode(raw: string | undefined | null): PinnedMode | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  return VALID.has(v) ? (v as PinnedMode) : null
}

/** Build the `document.cookie` / Set-Cookie string: sets a pinned mode, or
 *  deletes the cookie (mode=null → back to system). */
export function modeCookieString(
  mode: PinnedMode | null,
  secure: boolean,
): string {
  const attrs = [
    `${MODE_PREF_COOKIE}=${mode ?? ''}`,
    'Path=/',
    `Max-Age=${mode ? MODE_PREF_MAX_AGE : 0}`,
    'SameSite=Lax',
  ]
  if (secure) attrs.push('Secure')
  return attrs.join('; ')
}

/** Persist + apply a mode choice in the browser: writes/deletes the cookie and
 *  flips `data-mode` on <html>, so the switch is instant (no reload; SSR picks
 *  the cookie up on the next navigation). No-op outside the browser. */
export function applyModeClient(mode: DisplayMode): void {
  if (typeof document === 'undefined') return
  const pinned = mode === 'system' ? null : mode
  document.cookie = modeCookieString(
    pinned,
    window.location.protocol === 'https:',
  )
  if (pinned) document.documentElement.dataset.mode = pinned
  else delete document.documentElement.dataset.mode
}
