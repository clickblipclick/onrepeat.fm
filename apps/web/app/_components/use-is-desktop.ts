'use client'

import { useSyncExternalStore } from 'react'

const DESKTOP = '(min-width: 1024px)' // Tailwind `lg` — the play-time routing breakpoint

// One module-level MediaQueryList shared by every consumer (a feed mounts one
// PlaybackProvider per card) instead of a listener + state copy per hook instance.
const mql = typeof window === 'undefined' ? null : window.matchMedia(DESKTOP)

function subscribe(onChange: () => void): () => void {
  mql?.addEventListener('change', onChange)
  return () => mql?.removeEventListener('change', onChange)
}

/** True at desktop widths. Returns false during SSR/hydration, then tracks the media
 *  query — playback is a client-only interaction, so the pre-hydration value is unused. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mql?.matches ?? false,
    () => false,
  )
}
