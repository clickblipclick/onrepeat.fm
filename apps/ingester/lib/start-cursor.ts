/**
 * Where the Jetstream subscription should start, decided from the stored
 * `subscription_state` rows.
 *
 * Jetstream v2 cursors are `seq` values that are only meaningful on the host
 * that issued them (the docs guarantee nothing across hosts, and v1 cursors are
 * a different domain entirely), so each host gets its own row, keyed
 * `jetstream:<host>`. A seq is trusted only when it comes from the current
 * host's row AND that row is the freshest position we know. Anything else — the
 * legacy `firehose` row on first deploy, another host's row after a URL change,
 * a fresher `firehose` row after a rollback — is a *cutover*: we hand the server
 * a unix-microsecond timestamp instead, which it maps to the nearest seq. The
 * server tells the two apart by magnitude: values at or above 1e15 are
 * timestamps. A timestamp seed is never persisted — the first real seq is.
 */

export const TIMESTAMP_CURSOR_MIN = 1e15
/** Rewind applied to a wall-clock position before handing it to the server. */
export const CUTOVER_MARGIN_MS = 60_000

export interface CursorRow {
  service: string
  cursor: number
  updatedAt: Date
}

export type StartCursorSource =
  'override' | 'live-tail' | 'same-host-seq' | 'cutover' | 'none'

export interface StartCursor {
  /** Undefined means "start at the live head". */
  cursor?: number
  source: StartCursorSource
  /** The stored row the decision was made from, when there was one. */
  from?: CursorRow
  /** How long ago that row last advanced. */
  staleMs?: number
}

/** The subscription_state service key for a Jetstream origin. */
export function jetstreamServiceKey(origin: string): string {
  return `jetstream:${new URL(origin).host}`
}

/**
 * A wall-clock position as a Jetstream timestamp cursor (unix microseconds),
 * rewound by `marginMs` so an at-least-once redelivery covers in-flight work.
 */
export function timestampCursor(
  at: Date,
  marginMs: number = CUTOVER_MARGIN_MS,
): number {
  const cursor = (at.getTime() - marginMs) * 1000
  if (cursor < TIMESTAMP_CURSOR_MIN) {
    throw new RangeError(
      `timestamp cursor ${cursor} is below ${TIMESTAMP_CURSOR_MIN} and would be read as a seq`,
    )
  }
  return cursor
}

export function isTimestampCursor(cursor: number): boolean {
  return cursor >= TIMESTAMP_CURSOR_MIN
}

/** Parse the INGESTER_START_CURSOR escape hatch; unset/blank means "not set". */
export function parseStartCursorOverride(
  raw: string | undefined,
): number | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  const n = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n)) {
    throw new Error(
      `INGESTER_START_CURSOR must be a non-negative integer (a Jetstream seq, or a unix-microsecond timestamp >= 1e15); got "${raw}"`,
    )
  }
  return n
}

export interface ResolveStartCursorInput {
  liveTail: boolean
  override?: number
  serviceKey: string
  rows: CursorRow[]
  now: number
  marginMs?: number
}

export function resolveStartCursor(
  input: ResolveStartCursorInput,
): StartCursor {
  const { liveTail, override, serviceKey, rows, now, marginMs } = input
  if (override !== undefined) return { cursor: override, source: 'override' }
  if (liveTail) return { source: 'live-tail' }
  if (rows.length === 0) return { source: 'none' }

  // Freshest row wins; on an exact tie the current host's own row is preferred.
  const freshest = rows.reduce((best, r) => {
    const dt = r.updatedAt.getTime() - best.updatedAt.getTime()
    if (dt > 0) return r
    if (dt === 0 && r.service === serviceKey && best.service !== serviceKey) {
      return r
    }
    return best
  })
  const staleMs = now - freshest.updatedAt.getTime()

  if (freshest.service === serviceKey) {
    return {
      cursor: freshest.cursor,
      source: 'same-host-seq',
      from: freshest,
      staleMs,
    }
  }
  return {
    cursor: timestampCursor(freshest.updatedAt, marginMs),
    source: 'cutover',
    from: freshest,
    staleMs,
  }
}
