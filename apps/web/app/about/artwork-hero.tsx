import { getRecentArtwork, type RecentArtwork } from '@onrepeat/appview'
import { defaultThemeForDid, resolveTheme } from '@onrepeat/core'

import { cardPattern } from '@/lib/card-pattern'
import { db } from '@/lib/db'

const COLS = 32
const ROWS = 3
const TOTAL = COLS * ROWS // 96 tiles ≈ 3830px — full bleed through ultrawide widths

// Deterministic fract-hash for jitter (no RNG — server render must be stable).
function jitter(j: number): number {
  return ((j * 2654435761) >>> 0) / 2 ** 32
}

/**
 * Full-bleed decorative strip of recent jam artwork interspersed with
 * accent-colored and accent-patterned profile-theme tiles, as a fixed 32×3
 * grid that always fills the viewport: artwork is scattered across the strip
 * in jittered strata and any gaps are backfilled with theme tiles, so it
 * renders even with no artwork at all. The bottom of the strip fades out and
 * the page content that follows intentionally rides up into the faded zone.
 * Only a DB error hides the hero, so the page never breaks over it.
 */
export async function ArtworkHero() {
  let art: RecentArtwork[]
  try {
    art = await getRecentArtwork(db, 48)
  } catch {
    return null
  }

  // Slots ≡ 1 (mod 5) always hold a theme tile; the rest are eligible for
  // artwork. One artwork per stratum of eligible slots, jittered within its
  // stratum so the cadence can't alias against the 3-row column wrap into
  // stripes.
  const eligible: number[] = []
  for (let s = 0; s < TOTAL; s++) if (s % 5 !== 1) eligible.push(s)
  const artSlots = new Set<number>()
  if (art.length > 0) {
    const count = Math.min(art.length, eligible.length)
    const stratum = eligible.length / count
    let prev = -1
    for (let j = 0; j < count; j++) {
      let idx = Math.min(
        eligible.length - 1,
        Math.floor((j + jitter(j)) * stratum),
      )
      if (idx <= prev) idx = prev + 1 // jitter collision — keep strictly increasing
      if (idx >= eligible.length) break
      prev = idx
      artSlots.add(eligible[idx]!)
    }
  }

  const tileClass = 'aspect-square rounded border border-border'
  const tiles: React.ReactNode[] = []
  let nextArt = 0
  for (let slot = 0; slot < TOTAL; slot++) {
    const a = artSlots.has(slot) ? art[nextArt++] : undefined
    if (a) {
      tiles.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={slot}
          src={a.artworkUrl}
          alt=""
          loading="lazy"
          className={`object-cover ${tileClass}`}
        />,
      )
    } else {
      const donor = art.length > 0 ? art[slot % art.length] : undefined
      const theme = donor
        ? resolveTheme(donor.colorTheme, donor.authorDid)
        : defaultThemeForDid(`tile-${slot}`)
      // Deterministic pseudo-random look per slot (no RNG — the server render
      // must be stable): every so often a solid accent tile, otherwise a bold
      // patterned one.
      const surface =
        (slot * 31) % 4 === 0
          ? 'bg-accent'
          : `${cardPattern(`tile-${slot}`)} pat-bold`
      tiles.push(
        <span
          key={slot}
          data-theme={theme}
          className={`block ${surface} ${tileClass}`}
        />,
      )
    }
  }

  return (
    <div
      aria-hidden
      className="relative left-1/2 -mb-16 w-screen -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(to_bottom,black_45%,transparent_95%)]"
    >
      <div className="grid auto-cols-[7rem] grid-flow-col grid-rows-3 justify-center gap-2">
        {tiles}
      </div>
    </div>
  )
}
