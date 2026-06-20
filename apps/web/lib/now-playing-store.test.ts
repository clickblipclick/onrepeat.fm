import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearNowPlaying,
  getNowPlaying,
  playNowPlaying,
  subscribeNowPlaying,
  type NowPlaying,
} from './now-playing-store'

const A: NowPlaying = {
  jamUri: 'at://a/jam/1',
  embed: { kind: 'iframe', provider: 'spotify', src: 's-a', title: 'pa' },
  title: 'Song A',
  artist: 'Artist A',
  artworkUrl: null,
}
const B: NowPlaying = {
  jamUri: 'at://b/jam/2',
  embed: { kind: 'iframe', provider: 'youtube', src: 's-b', title: 'pb' },
  title: 'Song B',
  artist: 'Artist B',
  artworkUrl: 'http://art/b.jpg',
}

afterEach(() => clearNowPlaying())

describe('now-playing-store', () => {
  it('starts empty', () => {
    expect(getNowPlaying()).toBeNull()
  })

  it('play sets the now-playing slot', () => {
    playNowPlaying(A)
    expect(getNowPlaying()).toEqual(A)
  })

  it('play replaces the previous slot (single active)', () => {
    playNowPlaying(A)
    playNowPlaying(B)
    expect(getNowPlaying()).toEqual(B)
  })

  it('clear empties the slot', () => {
    playNowPlaying(A)
    clearNowPlaying()
    expect(getNowPlaying()).toBeNull()
  })

  it('notifies subscribers on play and clear, and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeNowPlaying(listener)
    playNowPlaying(A) // 1
    playNowPlaying(B) // 2
    clearNowPlaying() // 3
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
    playNowPlaying(A)
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('clear on an already-empty slot does not notify', () => {
    const listener = vi.fn()
    subscribeNowPlaying(listener)
    clearNowPlaying()
    expect(listener).not.toHaveBeenCalled()
  })
})
