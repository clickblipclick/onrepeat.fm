export interface RateLimiterOptions {
  /** Minimum gap between the START of consecutive calls. */
  minIntervalMs: number
  /** Injectable for tests; defaults to Date.now. */
  now?: () => number
  /** Injectable for tests; defaults to a setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>
}

export type RateLimiter = <T>(fn: () => Promise<T>) => Promise<T>

/**
 * Serialize async calls and space their starts at least `minIntervalMs` apart — a simple
 * client-side throttle so a worker (or backfill) can't burst past an external API's rate
 * limit (e.g. iTunes ~20 req/min). Calls run in submission order, one at a time. A rejected
 * call propagates to its caller without wedging the queue.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const now = opts.now ?? (() => Date.now())
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  let tail: Promise<unknown> = Promise.resolve()
  let lastStart = -Infinity

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(async () => {
      const wait = lastStart + opts.minIntervalMs - now()
      if (wait > 0) await sleep(wait)
      lastStart = now()
      return fn()
    })
    // Advance the queue regardless of this call's outcome, but don't swallow the
    // rejection for the actual caller.
    tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
