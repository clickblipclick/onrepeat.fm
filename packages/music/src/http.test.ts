import { describe, expect, it } from 'vitest'

import { failureReason, fetchWithRetry } from './http'

type Res = { ok: boolean; status: number }
const ok: Res = { ok: true, status: 200 }
const res = (status: number): Res => ({ ok: status < 400, status })

const noSleep = async () => {}
const noJitter = () => 0

describe('fetchWithRetry', () => {
  it('returns immediately on a successful response (one call, no sleep)', async () => {
    let calls = 0
    let slept = 0
    const out = await fetchWithRetry(
      async () => {
        calls++
        return ok
      },
      { sleep: async () => void slept++, jitter: noJitter },
    )
    expect(out).toBe(ok)
    expect(calls).toBe(1)
    expect(slept).toBe(0)
  })

  it('retries on 503 then succeeds', async () => {
    let calls = 0
    const out = await fetchWithRetry(
      async () => {
        calls++
        return calls < 3 ? res(503) : ok
      },
      { attempts: 5, baseDelayMs: 1, sleep: noSleep, jitter: noJitter },
    )
    expect(out.ok).toBe(true)
    expect(calls).toBe(3)
  })

  it('retries on 429 then succeeds', async () => {
    let calls = 0
    const out = await fetchWithRetry(
      async () => {
        calls++
        return calls < 2 ? res(429) : ok
      },
      { sleep: noSleep, jitter: noJitter },
    )
    expect(out.ok).toBe(true)
    expect(calls).toBe(2)
  })

  it('cancels the body of an abandoned retryable response (frees the socket)', async () => {
    let cancelled = 0
    const bad = {
      ok: false,
      status: 503,
      body: {
        async cancel() {
          cancelled++
        },
      },
    }
    let calls = 0
    const out = await fetchWithRetry(
      async () => (calls++ === 0 ? bad : { ...ok, body: null }),
      { sleep: noSleep, jitter: noJitter },
    )
    expect(out.ok).toBe(true)
    expect(cancelled).toBe(1)
  })

  it('does NOT retry a non-retryable 4xx (returns it)', async () => {
    let calls = 0
    const out = await fetchWithRetry(
      async () => {
        calls++
        return res(404)
      },
      { sleep: noSleep, jitter: noJitter },
    )
    expect(out.status).toBe(404)
    expect(calls).toBe(1)
  })

  it('retries a thrown network error then succeeds', async () => {
    let calls = 0
    const out = await fetchWithRetry(
      async () => {
        calls++
        if (calls < 2) throw new Error('ECONNRESET')
        return ok
      },
      { sleep: noSleep, jitter: noJitter },
    )
    expect(out.ok).toBe(true)
    expect(calls).toBe(2)
  })

  it('returns the last response after exhausting retries on persistent 503', async () => {
    let calls = 0
    const out = await fetchWithRetry(
      async () => {
        calls++
        return res(503)
      },
      { attempts: 3, sleep: noSleep, jitter: noJitter },
    )
    expect(out.status).toBe(503)
    expect(calls).toBe(3)
  })

  it('rethrows the last error when the fetch persistently throws', async () => {
    let calls = 0
    await expect(
      fetchWithRetry(
        async () => {
          calls++
          throw new Error('down')
        },
        { attempts: 3, sleep: noSleep, jitter: noJitter },
      ),
    ).rejects.toThrow('down')
    expect(calls).toBe(3)
  })
})

describe('failureReason', () => {
  it('maps 429 and 5xx to transient', () => {
    expect(failureReason(429)).toBe('transient')
    expect(failureReason(500)).toBe('transient')
    expect(failureReason(503)).toBe('transient')
  })
  it('maps other 4xx to unreadable', () => {
    expect(failureReason(404)).toBe('unreadable')
    expect(failureReason(400)).toBe('unreadable')
    expect(failureReason(403)).toBe('unreadable')
  })
})
