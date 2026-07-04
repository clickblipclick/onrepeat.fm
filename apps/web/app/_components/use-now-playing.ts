'use client'

import { useSyncExternalStore } from 'react'

import {
  getNowPlaying,
  subscribeNowPlaying,
  type NowPlaying,
} from '../../lib/now-playing-store'

/** Subscribe to the now-playing slot. Returns null during SSR. (Full-object
 *  subscription — for per-card use, prefer `useIsNowPlaying` so a play/clear doesn't
 *  re-render every card on the page.) */
export function useNowPlaying(): NowPlaying | null {
  return useSyncExternalStore(subscribeNowPlaying, getNowPlaying, () => null)
}

/** Whether this jam occupies the now-playing slot. Subscribes to the derived boolean,
 *  so a play/clear only re-renders the cards whose answer actually changed. */
export function useIsNowPlaying(jamUri: string): boolean {
  return useSyncExternalStore(
    subscribeNowPlaying,
    () => getNowPlaying()?.jamUri === jamUri,
    () => false,
  )
}
