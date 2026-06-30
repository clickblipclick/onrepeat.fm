import type { ThemeName } from '@onrepeat/core'

import { cardPattern } from '@/lib/card-pattern'
import { cn } from '@/lib/cn'

/** The themed riso-print card surface shared by the feed card and the jam detail page.
 *  `interactive` adds the hover-shadow lift (feed cards are a route into the post; the
 *  detail page is not, so it omits the lift). */
export function JamCardShell({
  patternSeed,
  theme,
  interactive = false,
  className,
  children,
}: {
  /** Seed for the card's signature texture — the track's "<title> <artist>", so each
   *  song gets its own pattern (rather than every card from one author looking alike). */
  patternSeed: string
  theme?: ThemeName
  interactive?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <article
      data-theme={theme}
      className={cn(
        cardPattern(patternSeed),
        'overflow-hidden rounded-md border-2 border-accent bg-surface shadow-[4px_4px_0_0_var(--accent)]',
        interactive &&
          'transition-shadow hover:shadow-[6px_6px_0_0_var(--accent)]',
        className,
      )}
    >
      {children}
    </article>
  )
}

/** The inset, crisply-framed media region (artwork/player) inside a jam card. */
export function MediaFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4">
      <div className="overflow-hidden rounded">{children}</div>
    </div>
  )
}
