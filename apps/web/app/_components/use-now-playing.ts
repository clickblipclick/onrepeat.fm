'use client'

import { useSyncExternalStore } from 'react'

import {
  getNowPlaying,
  subscribeNowPlaying,
  type NowPlaying,
} from '../../lib/now-playing-store'

/** Subscribe to the now-playing slot. Returns null during SSR. (Full-object
 *  subscription — for per-card use, prefer `useNowPlayingSurface` so a play/clear doesn't
 *  re-render every card on the page.) */
export function useNowPlaying(): NowPlaying | null {
  return useSyncExternalStore(subscribeNowPlaying, getNowPlaying, () => null)
}

/** Where this jam is currently playing ('corner' | 'card'), or null if it isn't.
 *  Subscribes to the derived primitive, so a play/clear only re-renders the cards
 *  whose answer actually changed. */
export function useNowPlayingSurface(jamUri: string): 'corner' | 'card' | null {
  return useSyncExternalStore(
    subscribeNowPlaying,
    () => {
      const now = getNowPlaying()
      return now?.jamUri === jamUri ? now.surface : null
    },
    () => null,
  )
}
