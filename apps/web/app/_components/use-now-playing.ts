'use client'

import { useSyncExternalStore } from 'react'

import {
  getNowPlaying,
  subscribeNowPlaying,
  type NowPlaying,
} from '../../lib/now-playing-store'

/** Subscribe to the now-playing slot. Returns null during SSR. */
export function useNowPlaying(): NowPlaying | null {
  return useSyncExternalStore(subscribeNowPlaying, getNowPlaying, () => null)
}
