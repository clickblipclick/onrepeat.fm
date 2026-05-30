import { describe, it, expect, vi } from 'vitest'
import { createRateLimiter } from './throttle'

describe('createRateLimiter', () => {
  it('does not wait on the first call, then spaces subsequent calls by minIntervalMs', async () => {
    const sleep = vi.fn(async () => {})
    let t = 0
    const throttle = createRateLimiter({ minIntervalMs: 10_000, now: () => t, sleep })

    await throttle() // first: no wait
    expect(sleep).not.toHaveBeenCalled()

    t = 3_000
    await throttle() // 7s left in the window → waits
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenLastCalledWith(7_000)

    // simulate that the sleep advanced the clock to the allowed time
    t = 13_000
    await throttle() // interval elapsed → no wait
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('anchors the next window to the post-sleep clock, not the pre-sleep request time', async () => {
    let t = 0
    const sleep = vi.fn(async () => { t = 12_000 }) // sleep advances the clock past the boundary
    const throttle = createRateLimiter({ minIntervalMs: 10_000, now: () => t, sleep })

    await throttle() // t=0 → no wait; lastStart=0
    t = 3_000
    await throttle() // wait 7000; sleep sets t=12_000; lastStart=12_000 (post-sleep)
    t = 13_000
    await throttle() // only 1000ms since lastStart=12_000 → must wait 9000
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenLastCalledWith(9_000) // 12_000 + 10_000 - 13_000
  })
})
