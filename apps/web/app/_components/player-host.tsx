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
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // Leaving desktop while something is queued (e.g. shrinking the window) drops it rather than
  // faking a handoff — mobile playback would need a reload to continue.
  useEffect(() => {
    if (nowPlaying && !isDesktop) clearNowPlaying()
  }, [nowPlaying, isDesktop])

  // Move focus to the close button when a player appears (keyboard handle on the corner).
  // preventScroll so focusing the fixed control never scrolls the page.
  useEffect(() => {
    if (nowPlaying && isDesktop)
      closeRef.current?.focus({ preventScroll: true })
  }, [nowPlaying, isDesktop])

  if (!nowPlaying || !isDesktop) return null

  return (
    <div
      role="region"
      aria-label="Active player"
      className="fixed right-4 bottom-4 z-[60] rounded-xl shadow-2xl ring-1 ring-black/10"
    >
      <button
        type="button"
        ref={closeRef}
        onClick={clearNowPlaying}
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
      />
    </div>
  )
}
