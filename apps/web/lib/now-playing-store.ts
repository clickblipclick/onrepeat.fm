/** The single source of truth for the desktop persistent corner player.
 *
 *  DOM-free (unit-tested in the node vitest env). One slot: `play` sets/replaces it, `clear`
 *  empties it. The <PlayerHost> in the root layout subscribes and renders the embed in the
 *  corner; because that host lives in the persistent layout, its iframe survives client-side
 *  navigation. Single-active is inherent — there is only one slot. */
import type { Embed } from './embed'

export interface NowPlaying {
  jamUri: string
  embed: Embed
  /** Where this playback lives — decided once at play time (see start() in playback.tsx):
   *  'corner' renders in the persistent host, 'card' renders inside the jam card. One
   *  slot covering both surfaces is what makes playback single-active app-wide. */
  surface: 'corner' | 'card'
  /** The jam author's color-theme slug, so the corner player (hosted outside the card's
   *  themed subtree) can re-apply it via `data-theme` and match the card's accent. */
  theme?: string
  /** Keyboard-initiated plays set this so the corner host takes focus — the card's play
   *  button unmounts on desktop, so focus would otherwise be dropped on <body>. Mouse
   *  plays leave it unset (stealing focus would make Space close the player). */
  focusCorner?: boolean
}

let current: NowPlaying | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/** Set (or replace) the now-playing slot. */
export function playNowPlaying(next: NowPlaying): void {
  current = next
  emit()
}

/** Empty the slot (stop / dismiss). No-op + no notify if already empty. */
export function clearNowPlaying(): void {
  if (current === null) return
  current = null
  emit()
}

export function getNowPlaying(): NowPlaying | null {
  return current
}

export function subscribeNowPlaying(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
