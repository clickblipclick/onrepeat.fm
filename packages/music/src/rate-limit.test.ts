import { describe, it, expect } from 'vitest'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('spaces consecutive calls by at least minIntervalMs', async () => {
    let t = 0
    const slept: number[] = []
    const limit = createRateLimiter({
      minIntervalMs: 1000,
      now: () => t,
      sleep: async (ms) => {
        slept.push(ms)
        t += ms // advance the virtual clock by however long we slept
      },
    })
    const order: string[] = []
    await limit(async () => {
      order.push('a')
    }) // first call: no prior start, runs immediately
    await limit(async () => {
      order.push('b')
    }) // must wait a full interval after the first
    expect(slept).toEqual([1000])
    expect(order).toEqual(['a', 'b'])
  })

  it('does not delay the first call', async () => {
    let slept = false
    const limit = createRateLimiter({
      minIntervalMs: 5000,
      now: () => 0,
      sleep: async () => {
        slept = true
      },
    })
    await limit(async () => undefined)
    expect(slept).toBe(false)
  })

  it('serializes concurrent calls (one at a time)', async () => {
    const limit = createRateLimiter({
      minIntervalMs: 0,
      now: () => 0,
      sleep: async () => {},
    })
    let active = 0
    let maxActive = 0
    const task = () =>
      limit(async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        active--
      })
    await Promise.all([task(), task(), task()])
    expect(maxActive).toBe(1)
  })

  it('keeps working after a call rejects (no wedged chain)', async () => {
    const limit = createRateLimiter({
      minIntervalMs: 0,
      now: () => 0,
      sleep: async () => {},
    })
    await expect(
      limit(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    await expect(limit(async () => 'ok')).resolves.toBe('ok')
  })

  it('returns the wrapped call value', async () => {
    const limit = createRateLimiter({ minIntervalMs: 0 })
    expect(await limit(async () => 42)).toBe(42)
  })
})
