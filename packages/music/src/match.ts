/** A normalized comparison subject. durationSec is optional (not always known). */
export interface MatchInput {
  title: string
  artist: string
  durationSec?: number
}

/**
 * Fold diacritics (NFKD + strip combining marks, so "Beyoncé" from one provider
 * matches "Beyonce" from another); lowercase; drop (parentheticals)/[brackets]/feat…;
 * keep only letters+digits as tokens. The feat-tail rule requires the dot on "ft."
 * and skips title-initial matches so real titles ("50 Ft Queenie", "Ft. Worth
 * Blues") aren't truncated — keep in sync with @onrepeat/core's trackIdentity
 * normalization.
 */
export function normalizeTokens(s: string): string[] {
  return tokenize(s, { stripDecorations: true })
}

/**
 * Spotify labels versions as a "Title - Version" dash tail where Apple uses
 * "Title (Version)". Only the remaster class is stripped — a remaster is the
 * same recording, so its (often provider-specific) year must not count toward
 * required coverage; live/acoustic/mix tails name a DIFFERENT recording and are
 * kept so they can't match the studio version. Keep in sync with
 * @onrepeat/core's trackIdentity normalization. Applied post-lowercase.
 */
const REMASTER_DASH_TAIL =
  /\s[-–—]\s*(?:\d{4}\s+)?remaster(?:ed)?(?:\s+version)?(?:\s+\d{4})?\s*$/

/**
 * Candidate-side tokens: same folding as normalizeTokens, but (parenthetical)/
 * [bracket] CONTENT is kept (only the punctuation is dropped). Coverage asks
 * "are the anchor's tokens present in the candidate?", so discarding candidate
 * parentheticals only destroys evidence — e.g. Spotify's "Crazy - Midnight Mix"
 * could never match Apple's "Crazy (Midnight Mix)" once the candidate collapsed
 * to just "crazy". Anchor-side stripping stays: it shrinks what must be covered.
 */
function candidateTokens(s: string): string[] {
  return tokenize(s, { stripDecorations: false })
}

function tokenize(s: string, opts: { stripDecorations: boolean }): string[] {
  let t = s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
  if (opts.stripDecorations)
    t = t.replace(REMASTER_DASH_TAIL, ' ').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  return t
    .replace(/(?!^)\b(feat\b|ft\.|featuring\b).*$/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * True when `candidate` confidently refers to the same recording as `anchor`.
 * Rejects on a duration gap when both are known. Otherwise requires the anchor's
 * (title+artist) tokens to be (mostly) present in the candidate's (title+artist):
 * ≥80% coverage when durations corroborate, 100% when they don't (stricter).
 */
export function isConfidentMatch(
  anchor: MatchInput,
  candidate: MatchInput,
  opts: { durationToleranceSec?: number } = {},
): boolean {
  const tol = opts.durationToleranceSec ?? 4
  const bothDurations =
    anchor.durationSec != null && candidate.durationSec != null
  if (
    bothDurations &&
    Math.abs(anchor.durationSec! - candidate.durationSec!) > tol
  )
    return false

  const want = new Set([
    ...normalizeTokens(anchor.title),
    ...normalizeTokens(anchor.artist),
  ])
  if (want.size === 0) return false
  const have = new Set([
    ...candidateTokens(candidate.title),
    ...candidateTokens(candidate.artist),
  ])
  let hit = 0
  for (const t of want) if (have.has(t)) hit++
  const ratio = hit / want.size
  return ratio >= (bothDurations ? 0.8 : 1.0)
}
