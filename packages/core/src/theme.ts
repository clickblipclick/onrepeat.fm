/**
 * The profile color-theme registry. The slugs here must stay in sync with the
 * `[data-theme='<slug>']` blocks in apps/web/app/globals.css — that CSS owns the
 * actual palettes (light + dark); this module owns the canonical list, validation,
 * and the deterministic default so the same resolution runs on the server (root
 * theme + per-author feed cards) and in the settings picker.
 */

export const THEMES = [
  'clay',
  'court-green',
  'ink-cobalt',
  'marigold',
  'plum',
  'teal',
] as const

export type ThemeName = (typeof THEMES)[number]

/** Human-readable labels for the settings picker, in registry order. */
export const THEME_LABELS: Record<ThemeName, string> = {
  clay: 'Clay',
  'court-green': 'Court Green',
  'ink-cobalt': 'Ink Cobalt',
  marigold: 'Marigold',
  plum: 'Plum',
  teal: 'Teal',
}

/** The theme applied before any user has signed in / for DID-less contexts. */
export const FALLBACK_THEME: ThemeName = 'clay'

const VALID = new Set<string>(THEMES)

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && VALID.has(value)
}

/**
 * Deterministic "random" default: hash the DID to a stable theme. Same DID always
 * maps to the same theme, so an author who never picks one still renders consistently
 * everywhere they appear — and no write is needed on join. FNV-1a/32 (no RNG, no Date,
 * so it's pure and stable across server/client).
 */
export function defaultThemeForDid(did: string): ThemeName {
  let h = 0x811c9dc5
  for (let i = 0; i < did.length; i++) {
    h ^= did.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return THEMES[(h >>> 0) % THEMES.length]!
}

/**
 * Resolve a stored theme value (from the profile record / actors index) to a valid
 * theme for `did`. Unknown/missing/junk values degrade to the deterministic default.
 */
export function resolveTheme(
  stored: string | null | undefined,
  did: string,
): ThemeName {
  return isThemeName(stored) ? stored : defaultThemeForDid(did)
}
