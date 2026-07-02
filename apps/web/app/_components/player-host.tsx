'use client'

import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { clearNowPlaying } from '../../lib/now-playing-store'
import { DEFAULT_PINNED, EmbedFrame, PINNED_FRAME } from './embed-frame'
import { focusPlayControl } from './player'
import { useNowPlaying } from './use-now-playing'

/** Mounted once in the root layout (the persistent tree), so the embed iframe it renders is
 *  never unmounted by route changes — playback continues across client-side navigation.
 *  Only desktop-width plays route here (see start() in playback.tsx), but once playing it
 *  stays mounted whatever the viewport does: unmounting the iframe would kill the audio,
 *  so narrow widths are handled by CSS (max-w) instead of teardown. */
export function PlayerHost() {
  const nowPlaying = useNowPlaying()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // Take focus only for keyboard-initiated plays (focusCorner): the card's play button just
  // unmounted, so without this focus drops to <body>. Mouse plays must NOT steal focus —
  // the next Space/Enter would activate the close button and kill playback.
  // preventScroll so focusing the fixed control never scrolls the page.
  useEffect(() => {
    if (nowPlaying?.focusCorner)
      closeRef.current?.focus({ preventScroll: true })
  }, [nowPlaying])

  /** Close, and when focus was inside the host, hand it back to the originating card's
   *  play control (which remounts once the slot clears). */
  function close() {
    const jamUri = nowPlaying?.jamUri
    const hadFocus = hostRef.current?.contains(document.activeElement) ?? false
    clearNowPlaying()
    if (hadFocus && jamUri) focusPlayControl(jamUri)
  }

  if (!nowPlaying) return null

  return (
    <div
      ref={hostRef}
      role="region"
      aria-label="Active player"
      onKeyDown={(e) => {
        if (e.key === 'Escape') close()
      }}
      // Re-apply the source jam's theme here (the host lives outside the card's themed
      // subtree), so the accent frame matches the card it came from.
      data-theme={nowPlaying.theme}
      // z-40: persistent chrome sits UNDER transient overlays (menus/toasts/dropdowns are
      // z-50), so a popover opened near the corner is never hidden behind the player.
      // Below sm (640px) it's a flush full-width dock on the bottom edge (border-top only,
      // square corners, safe-area padding so the home indicator / notch never covers
      // content — env() resolves to 0 unless the page opts into viewport-fit=cover). At
      // sm+ it's the floating corner card; only the play-time routing uses the lg
      // breakpoint (see use-is-desktop). rounded-[18px]: concentric with the embed's 12px
      // clip + border-2 + p-1 (6px gap). The embed clip is pinned at 12px because
      // providers round their own internal card at ~12px — clipping tighter exposes the
      // iframe background in the corner wedge. sm:max-w keeps the fixed-width embeds (up
      // to 440px) inside a window that has since been shrunk below them.
      className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t-2 border-accent bg-surface p-1 pr-[calc(0.25rem+env(safe-area-inset-right))] pb-[calc(0.25rem+env(safe-area-inset-bottom))] pl-[calc(0.25rem+env(safe-area-inset-left))] shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-[calc(100vw-2rem)] sm:rounded-[18px] sm:border-2 sm:p-1"
    >
      {/* Keyed by jam+provider: switching service or track swaps the embed (resets the load
          gate); navigating with the same track keeps the same key → same iframe → no reload. */}
      <EmbedFrame
        key={`${nowPlaying.jamUri}:${nowPlaying.embed.provider}`}
        embed={nowPlaying.embed}
        sizeClass={PINNED_FRAME[nowPlaying.embed.provider] ?? DEFAULT_PINNED}
        // grow: fills the dock's full width below sm (inert in the content-sized corner
        // card). max-h caps video embeds in the dock — full-width 16:9 would swallow the
        // viewport; YouTube letterboxes inside the shorter frame. rounded-xl: 12px,
        // matching the embeds' own internal rounding (see the frame comment above).
        className="grow rounded-xl max-sm:max-h-48"
      />
      {/* Close spine: a rotated full-height label inside the frame, so the control reads
          as part of the player rather than a floating chip. */}
      <button
        type="button"
        ref={closeRef}
        onClick={close}
        aria-label="Close player"
        className="flex shrink-0 items-center justify-center gap-1 rounded-md px-0.5 text-xs font-bold tracking-wide text-accent uppercase transition [writing-mode:vertical-rl] hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Close
        <X size={12} aria-hidden />
      </button>
    </div>
  )
}
