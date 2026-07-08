export interface TrackIdentityInput {
  title?: string | null
  artist?: string | null
}

function normalizeText(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '') // strip combining marks (diacritics) exposed by NFKD
      .toLowerCase()
      // Drop decorations so identity matches @onrepeat/music's normalizeTokens — otherwise
      // "Bohemian Rhapsody (Official Video Remastered)" dedupes apart from "Bohemian Rhapsody".
      // Spotify's "Title - 2004 Remaster" dash tail — same recording, so it must
      // dedupe with the plain title and Apple's parenthesized form. Restricted to
      // the remaster class: live/acoustic/mix tails ARE different recordings and
      // keep their own key. Keep in sync with @onrepeat/music's normalizeTokens.
      .replace(
        /\s[-–—]\s*(?:\d{4}\s+)?remaster(?:ed)?(?:\s+version)?(?:\s+\d{4})?\s*$/,
        ' ',
      )
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // (parentheticals) / [brackets]
      // Featured-artist tails. Two guards keep real titles intact, since truncating
      // one corrupts its identity (risking wrong merges): the short form requires
      // the dot ("ft."), because bare "ft" is also the feet abbreviation ("50 Ft
      // Queenie" must not become "50"); and (?!^) skips title-initial matches,
      // because a credit never starts a title ("Ft. Worth Blues" must not empty
      // out). The cost — a dotless "Song ft X" not deduping against "Song" —
      // degrades gracefully to a split key, so it's the better trade.
      // Keep in sync with @onrepeat/music's normalizeTokens.
      .replace(/(?!^)\b(feat\b|ft\.|featuring\b).*$/g, ' ')
      // Keep letters/digits of ANY script (Unicode-aware) so non-Latin titles
      // (CJK, Cyrillic, Greek, …) aren't collapsed to an empty key. Matches the
      // \p{L}\p{N} class @onrepeat/music's normalizeTokens uses.
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  )
}

/**
 * Stable dedup key for a track.
 *
 * Keys are `ta:<artist>|<title>`. Historical rows may carry `isrc:`/`odesli:`
 * prefixed ids from earlier resolver eras — ids are opaque, so those still match
 * themselves; they just never merge with newly computed keys.
 */
export function trackIdentity(input: TrackIdentityInput): string {
  const title = normalizeText(input.title ?? '')
  const artist = normalizeText(input.artist ?? '')
  if (!title && !artist) {
    throw new Error('trackIdentity: requires at least one of title or artist')
  }
  return `ta:${artist}|${title}`
}
