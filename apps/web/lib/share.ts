import type { ThemeName } from '@onrepeat/core'

/** Light-mode profile accents, mirrored from the [data-theme] blocks in globals.css.
 *  Satori can't read CSS vars, so the OG card needs concrete hexes. Neutral fallback
 *  matches the `mono` chrome accent. */
const THEME_ACCENT: Record<ThemeName, string> = {
  clay: '#b64c27',
  'court-green': '#2f7d4f',
  'ink-cobalt': '#2b5bd7',
  marigold: '#966309',
  plum: '#7c4aa6',
  teal: '#0f766e',
}
const NEUTRAL_ACCENT = '#1a1a1c'

export function themeAccent(theme: ThemeName | undefined): string {
  return theme ? (THEME_ACCENT[theme] ?? NEUTRAL_ACCENT) : NEUTRAL_ACCENT
}

/** Satori has no auto-fit; pick a title size by length. Clamping to 3 lines is done
 *  in the card JSX. Sizes are tuned for the 1200×630 card. */
export function titleFontSize(title: string): number {
  const n = title.length
  if (n <= 18) return 64
  if (n <= 40) return 48
  return 38
}

/** Compose text for sharing a jam — the link rides in the text because Bluesky's
 *  compose intent takes a single `text` param and linkifies URLs itself. */
export function buildShareText(args: {
  title: string
  artist: string
  url: string
}): string {
  return `🔁 ${args.title} — ${args.artist}\n${args.url}`
}

export function blueskyComposeUrl(text: string): string {
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`
}

/** OG/Twitter text fields (rendered by the platform, not baked into the image). */
export function buildJamOgMeta(args: {
  title: string
  artist: string
  authorLabel: string
}): { title: string; description: string } {
  return {
    title: `${args.title} — ${args.artist} · onrepeat.fm`,
    description: `${args.authorLabel} has this on repeat right now.`,
  }
}
