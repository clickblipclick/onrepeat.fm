const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface RateLimiterOptions {
  /** Minimum gap between call starts. 10_000ms = ≤6/min, safely under Odesli's 10/min. */
  minIntervalMs: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Returns an async `throttle()` that spaces calls ≥minIntervalMs apart. Assumes a
 * single caller in series (the resolver worker runs with localConcurrency: 1).
 * `now`/`sleep` are injected for tests.
 */
export function createRateLimiter(opts: RateLimiterOptions): () => Promise<void> {
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? realSleep
  let lastStart = Number.NEGATIVE_INFINITY
  return async function throttle() {
    const wait = lastStart + opts.minIntervalMs - now()
    if (wait > 0) await sleep(wait)
    lastStart = now()
  }
}
