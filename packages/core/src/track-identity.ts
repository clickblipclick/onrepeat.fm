export interface TrackIdentityInput {
  isrc?: string | null
  odesliId?: string | null
  title?: string | null
  artist?: string | null
}

function normalizeText(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // strip combining diacritics
      .toLowerCase()
      // Drop decorations so identity matches @onrepeat/music's normalizeTokens — otherwise
      // "Bohemian Rhapsody (Official Video Remastered)" dedupes apart from "Bohemian Rhapsody".
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // (parentheticals) / [brackets]
      .replace(/\b(feat|ft|featuring)\b.*$/g, ' ') // featured-artist tails
      // Keep letters/digits of ANY script (Unicode-aware) so non-Latin titles
      // (CJK, Cyrillic, Greek, …) aren't collapsed to an empty key. Matches the
      // \p{L}\p{N} class @onrepeat/music's normalizeTokens uses.
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  )
}

function normalizeIsrc(isrc: string): string {
  return isrc.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/** Stable dedup key for a track. */
export function trackIdentity(input: TrackIdentityInput): string {
  // Gate on the NORMALIZED value, not a raw trim: a punctuation-only ISRC like "---"
  // trims non-empty but normalizes to "", which would collapse to the shared key "isrc:"
  // and shadow the title/artist fallback. Same for a normalized-empty Odesli id.
  const isrc = input.isrc ? normalizeIsrc(input.isrc) : ''
  if (isrc) return `isrc:${isrc}`
  const odesli = input.odesliId?.trim() ?? ''
  if (odesli) return `odesli:${odesli}`
  const title = normalizeText(input.title ?? '')
  const artist = normalizeText(input.artist ?? '')
  if (!title && !artist) {
    throw new Error(
      'trackIdentity: requires at least one of isrc, odesliId, title, or artist',
    )
  }
  return `ta:${artist}|${title}`
}
