import { describe, expect, it, vi } from 'vitest'

import { makeThrottledCursorWriter } from './cursor'

describe('makeThrottledCursorWriter', () => {
  it('writes immediately on first record, throttles within the interval, flushes the latest', async () => {
    const write = vi.fn(async () => {})
    let t = 0
    const w = makeThrottledCursorWriter(write, 5000, () => t)

    w.record(10)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenLastCalledWith(10)

    t = 3000
    w.record(11) // within interval → throttled
    expect(write).toHaveBeenCalledTimes(1)

    t = 6000
    w.record(12) // interval elapsed → writes
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith(12)

    await w.flush() // always persists the latest seq
    expect(write).toHaveBeenCalledTimes(3)
    expect(write).toHaveBeenLastCalledWith(12)
  })

  it('flush is a no-op when nothing was recorded', async () => {
    const write = vi.fn(async () => {})
    const w = makeThrottledCursorWriter(write, 5000, () => 0)
    await w.flush()
    expect(write).not.toHaveBeenCalled()
  })

  it('flush persists a seq that was only throttled, never written', async () => {
    const write = vi.fn(async () => {})
    let t = 0
    const w = makeThrottledCursorWriter(write, 5000, () => t)

    w.record(10) // writes immediately → lastWrite = 0
    t = 1000
    w.record(99) // throttled, not written
    await w.flush()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith(99)
  })
})
