export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number
  /** Base backoff in ms (exponential per attempt, plus jitter). Default 300. */
  baseDelayMs?: number
  /** Injectable for tests; defaults to a setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>
  /** Injectable 0..1 jitter source; defaults to Math.random. */
  jitter?: () => number
}

/**
 * Read a response body as text, aborting once it exceeds `maxBytes`. Without a cap a
 * hostile (or compromised) host could stream an unbounded response and OOM the single
 * worker — the request timeout bounds duration, not volume. Returns null when the cap
 * is exceeded. Test doubles omit `body` and just resolve `text()` (small, trusted).
 */
export async function readTextCapped(
  res: {
    text(): Promise<string>
    body?: ReadableStream<Uint8Array> | null
  },
  maxBytes: number,
): Promise<string | null> {
  if (!res.body) return res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(out)
}

/** Transient HTTP statuses worth retrying: rate-limit + server errors. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/** A fetch+parse outcome that distinguishes a retryable failure from a permanent one. */
export type FetchResult<T> =
  { ok: true; data: T } | { ok: false; reason: 'transient' | 'unreadable' }

/** Map a non-ok HTTP status to a failure reason (429/5xx ⇒ transient, else unreadable). */
export function failureReason(status: number): 'transient' | 'unreadable' {
  return isRetryableStatus(status) ? 'transient' : 'unreadable'
}

function backoffMs(
  base: number,
  attempt: number,
  jitter: () => number,
): number {
  const exp = base * 2 ** (attempt - 1)
  return exp + Math.floor(jitter() * base) // up to one extra `base` of jitter
}

/**
 * Run a fetch with bounded retries on transient failures — 429/5xx responses and thrown
 * network/timeout errors — using exponential backoff with jitter. A non-retryable response
 * (2xx/3xx, or a 4xx other than 429) is returned as-is for the caller to handle; after the
 * last attempt the final response is returned (or the last error rethrown). `doFetch` is a
 * thunk so each attempt gets a fresh request (and a fresh AbortSignal timeout).
 */
export async function fetchWithRetry<T extends { ok: boolean; status: number }>(
  doFetch: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 300
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const jitter = opts.jitter ?? Math.random

  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await doFetch()
      if (res.ok || !isRetryableStatus(res.status) || attempt >= attempts)
        return res
    } catch (err) {
      lastErr = err
      if (attempt >= attempts) throw err
    }
    await sleep(backoffMs(baseDelayMs, attempt, jitter))
  }
  // Unreachable: the loop returns the response or throws on the final attempt.
  throw lastErr
}
