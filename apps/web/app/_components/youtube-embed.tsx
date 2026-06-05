'use client'

import { useEffect, useRef } from 'react'

// Minimal shape of the YouTube IFrame Player API bits we use.
interface YTPlayer {
  destroy(): void
}
interface YTPlayerOptions {
  width: string
  height: string
  videoId: string
  playerVars?: Record<string, number>
  events?: { onReady?: () => void; onError?: (e: { data: number }) => void }
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer
}
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }

let apiPromise: Promise<YTNamespace> | null = null

/** Load the YouTube IFrame API once (singleton); resolves with the YT namespace. */
function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as unknown as YTWindow
  if (w.YT?.Player) return Promise.resolve(w.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YTNamespace>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (w.YT) resolve(w.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return apiPromise
}

/**
 * A YouTube embed rendered via the IFrame Player API so we can detect playback failures
 * (`onError` codes 100/101/150 — removed/private, embedding disabled, or region/age blocked
 * in the *viewer's* region) and fall back. Mount one per play; key it by videoId upstream.
 */
export function YouTubeEmbed({
  videoId,
  onReady,
  onError,
  className,
}: {
  videoId: string
  onReady?: () => void
  onError?: (code: number) => void
  className?: string
}) {
  const slotRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let player: YTPlayer | undefined
    let cancelled = false
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !slotRef.current) return
        player = new YT.Player(slotRef.current, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: () => onReady?.(),
            onError: (e) => onError?.(e.data),
          },
        })
      })
      .catch(() => onError?.(-1)) // API failed to load → treat as unplayable here
    return () => {
      cancelled = true
      try {
        player?.destroy()
      } catch {
        /* already torn down */
      }
    }
    // Re-create only when the video changes; the callbacks are stable for a given mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  // YT.Player replaces the inner slot with its iframe; the outer div stays React-managed.
  return (
    <div className={className}>
      <div ref={slotRef} className="h-full w-full" />
    </div>
  )
}
