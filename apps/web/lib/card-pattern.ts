// The subtle card-surface textures defined in globals.css (`.pat-*`). Colors come from
// the active theme, so the same geometry looks different on a marigold vs. a teal card.
const PATTERNS = [
  'pat-rings',
  'pat-diagonal',
  'pat-scales',
  'pat-iso',
  'pat-zigzag',
  'pat-pinwheel',
  'pat-arcs',
] as const

/**
 * Pick a stable background-pattern class for a card from a seed (the author's DID): one
 * person's cards share a signature texture, while a feed of different people varies. FNV-1a
 * hash → deterministic, no RNG.
 */
export function cardPattern(seed: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return PATTERNS[(h >>> 0) % PATTERNS.length]!
}
