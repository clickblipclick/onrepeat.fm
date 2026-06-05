/** A normalized comparison subject. durationSec is optional (not always known). */
export interface MatchInput {
  title: string
  artist: string
  durationSec?: number
}

/** Lowercase; drop (parentheticals)/[brackets]/feat…; keep only letters+digits as tokens. */
export function normalizeTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/g, ' ')
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
    ...normalizeTokens(candidate.title),
    ...normalizeTokens(candidate.artist),
  ])
  let hit = 0
  for (const t of want) if (have.has(t)) hit++
  const ratio = hit / want.size
  return ratio >= (bothDurations ? 0.8 : 1.0)
}
