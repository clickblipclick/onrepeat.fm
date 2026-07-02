'use client'

import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { clearNowPlaying } from '../../lib/now-playing-store'
import { DEFAULT_PINNED, EmbedFrame, PINNED_FRAME } from './embed-frame'
import { useIsDesktop } from './use-is-desktop'
import { useNowPlaying } from './use-now-playing'

/** Mounted once in the root layout (the persistent tree), so the embed iframe it renders is
 *  never unmounted by route changes — playback continues across client-side navigation.
 *  Desktop only; renders nothing on mobile or when nothing is playing. */
export function PlayerHost() {
  const nowPlaying = useNowPlaying()
  const isDesktop = useIsDesktop()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // Leaving desktop while something is queued (e.g. shrinking the window) drops it rather than
  // faking a handoff — mobile playback would need a reload to continue.
  useEffect(() => {
    if (nowPlaying && !isDesktop) clearNowPlaying()
  }, [nowPlaying, isDesktop])

  // Take focus only for keyboard-initiated plays (focusCorner): the card's play button just
  // unmounted, so without this focus drops to <body>. Mouse plays must NOT steal focus —
  // the next Space/Enter would activate the close button and kill playback.
  // preventScroll so focusing the fixed control never scrolls the page.
  useEffect(() => {
    if (nowPlaying?.focusCorner && isDesktop)
      closeRef.current?.focus({ preventScroll: true })
  }, [nowPlaying, isDesktop])

  /** Close, and when focus was inside the host, hand it back to the originating card's
   *  play control (which remounts once the slot clears — hence the rAF). */
  function close() {
    const jamUri = nowPlaying?.jamUri
    const hadFocus = hostRef.current?.contains(document.activeElement) ?? false
    clearNowPlaying()
    if (!hadFocus || !jamUri) return
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-play-jam="${CSS.escape(jamUri)}"]`)
        ?.focus({ preventScroll: true })
    })
  }

  if (!nowPlaying || !isDesktop) return null

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
      // rounded-[18px]: concentric with the embed's 12px clip + border-2 + p-1 (6px gap).
      // The embed clip is pinned at 12px because providers round their own internal card
      // at ~12px — clipping tighter exposes the iframe background in the corner wedge.
      className="fixed right-4 bottom-4 z-40 rounded-[18px] border-2 border-accent bg-surface p-1 shadow-2xl"
    >
      <button
        type="button"
        ref={closeRef}
        onClick={close}
        aria-label="Close player"
        className="absolute -top-7 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black text-white ring-1 ring-white/30 transition hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X size={13} aria-hidden />
      </button>
      {/* Keyed by jam+provider: switching service or track swaps the embed (resets the load
          gate); navigating with the same track keeps the same key → same iframe → no reload. */}
      <EmbedFrame
        key={`${nowPlaying.jamUri}:${nowPlaying.embed.provider}`}
        embed={nowPlaying.embed}
        sizeClass={PINNED_FRAME[nowPlaying.embed.provider] ?? DEFAULT_PINNED}
        // 12px, matching the embeds' own internal rounding (see the frame comment above).
        className="rounded-xl"
      />
    </div>
  )
}
