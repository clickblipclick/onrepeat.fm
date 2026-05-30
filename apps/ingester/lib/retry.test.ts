import { describe, it, expect, vi } from 'vitest'
import { withRetry } from './retry'

describe('withRetry', () => {
  it('returns the result on first success without retrying or sleeping', async () => {
    const sleep = vi.fn(async () => {})
    const fn = vi.fn(async () => 'ok')
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1, sleep })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('retries then succeeds, sleeping only between attempts', async () => {
    const sleep = vi.fn(async () => {})
    let n = 0
    const fn = vi.fn(async () => {
      n++
      if (n < 3) throw new Error('transient')
      return 'ok'
    })
    const result = await withRetry(fn, { attempts: 5, baseDelayMs: 1, sleep })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2) // between the 3 calls, not after success
  })

  it('throws the last error after exhausting attempts, with no sleep after the final attempt', async () => {
    const sleep = vi.fn(async () => {})
    const fn = vi.fn(async () => {
      throw new Error('always')
    })
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1, sleep })).rejects.toThrow('always')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2) // not 3 — no sleep after the final failure
  })
})
