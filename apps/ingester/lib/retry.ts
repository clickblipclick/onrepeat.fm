export interface RetryOptions {
  attempts: number
  baseDelayMs: number
  label?: string
  /** Injected for tests; defaults to a real setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run `fn`, retrying on rejection up to `attempts` times with exponential backoff.
 * Re-throws the last error if all attempts fail. Intended for idempotent operations.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const sleep = opts.sleep ?? realSleep
  let lastErr: unknown
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < opts.attempts) {
        const delay = opts.baseDelayMs * 2 ** (attempt - 1)
        console.warn(
          `[ingester] retry ${attempt}/${opts.attempts}${opts.label ? ` ${opts.label}` : ''} after error; waiting ${delay}ms`,
          err,
        )
        await sleep(delay)
      }
    }
  }
  throw lastErr
}
