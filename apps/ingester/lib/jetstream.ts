import { MemoryRunner } from '@atproto/sync'
import {
  Jetstream,
  websocketTransport,
  type CollectionFilter,
  type CursorStore,
  type Kind,
  type LiveOpts,
} from '@bsky/jetstream'

import { recordFailedEvent, type DB } from '@onrepeat/db'
import {
  FOLLOW_NSID,
  JAM_NSID,
  LIKE_NSID,
  PROFILE_NSID,
} from '@onrepeat/lexicons'

import {
  loadCursorStates,
  makeThrottledCursorWriter,
  saveCursor,
} from './cursor'
import { runWithDeadLetter } from './dead-letter'
import {
  ingestEventLabel,
  toFailedEventInput,
  toIngestEvent,
  type IngestEvent,
  type JetstreamEvent,
} from './events'
import { defaultHooks, type IngesterHooks } from './hooks'
import { handleIngestEvent } from './indexer'
import { withRetry } from './retry'
import {
  CUTOVER_MARGIN_MS,
  isTimestampCursor,
  jetstreamServiceKey,
  resolveStartCursor,
  timestampCursor,
  type CursorRow,
  type StartCursor,
} from './start-cursor'

/** Railway runs in sfo, so the west-coast Jetstream v2 instance is the default. */
export const DEFAULT_JETSTREAM_URL = 'https://jetstream.us-west.bsky.network'
/** Server-side commit filter: exactly the collections the indexer knows. */
export const INGEST_COLLECTIONS: readonly string[] = [
  JAM_NSID,
  LIKE_NSID,
  PROFILE_NSID,
  FOLLOW_NSID,
]
/** Account events keep actor status mirrored; identity/sync stay out, as before. */
export const INGEST_KINDS: readonly Kind[] = ['commit', 'account']
export const RECONNECT_BASE_MS = 3000
export const RECONNECT_MAX_MS = 60_000

const CURSOR_INTERVAL_MS = 5000
// Cap concurrent in-flight handlers. MemoryRunner defaults to Infinity; keep this
// ≤ the DB pool size (createDb defaults to pg's max 10).
const DEFAULT_CONCURRENCY = 8
const CURSOR_STALE_WARN_MS = 6 * 60 * 60 * 1000

export type LiveSourceOpts = Pick<
  LiveOpts,
  'cursor' | 'signal' | 'onError' | 'onInfo'
>
export type LiveSource = (opts: LiveSourceOpts) => AsyncIterable<JetstreamEvent>

/** Seams for tests; every one has a production default. */
export interface IngesterDeps {
  source: LiveSource
  loadRows: () => Promise<CursorRow[]>
  persistCursor: (seq: number) => Promise<void>
  handle: (evt: IngestEvent) => Promise<void>
  now: () => number
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
}

export interface CreateIngesterOpts {
  db: DB
  /** Jetstream v2 origin, e.g. https://jetstream.us-west.bsky.network */
  service: string
  hooks?: IngesterHooks
  /** Dev: ignore stored cursors and start at the live head. */
  liveTail?: boolean
  /** INGESTER_START_CURSOR, already parsed: a seq, or a unix-µs timestamp (≥ 1e15). */
  startCursor?: number
  /** Last-resort handler when an event can't even be dead-lettered (e.g. DB down). Default:
   *  log and exit(1) so the process restarts and resumes from the persisted cursor. */
  onFatal?: (err: Error) => void
  /** Max concurrent in-flight event handlers. Keep ≤ the DB pool size. Default 8. */
  concurrency?: number
  deps?: Partial<IngesterDeps>
}

export interface IngesterRuntime {
  start(): Promise<void>
  stop(): Promise<void>
}

/** Sleep that ends early when the signal aborts; never rejects. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}

// ws reports a refused upgrade as `Unexpected server response: <status>` and discards
// the body; ws-client wraps that one level deep in a SocketError. The SDK keys its own
// reconnect policy on this text (its helper is not exported), so match it here rather
// than add a dependency for an instanceof check. Should the wording ever change, every
// rejection reads as "unknown status" and keeps the seq — loud, never a silent move.
const HANDSHAKE_REJECTION_RE = /Unexpected server response: (\d{3})/

/** HTTP status of a websocket handshake the server refused, if `err` is one. */
export function handshakeRejectionStatus(err: unknown): number | undefined {
  let e: unknown = err
  for (let depth = 0; depth < 3 && e instanceof Error; depth++) {
    const m = HANDSHAKE_REJECTION_RE.exec(e.message)
    if (m) return Number(m[1])
    e = e.cause
  }
  return undefined
}

function describeCursor(cursor: number | undefined): string {
  if (cursor === undefined) return 'live head'
  if (isTimestampCursor(cursor)) {
    return `timestamp ${cursor} (${new Date(cursor / 1000).toISOString()})`
  }
  return `seq ${cursor}`
}

function logStart(start: StartCursor, serviceKey: string): void {
  const stale =
    start.staleMs === undefined
      ? ''
      : ` (last advanced ${(start.staleMs / 3_600_000).toFixed(1)}h ago)`
  switch (start.source) {
    case 'override':
      console.warn(
        `[ingester] INGESTER_START_CURSOR override in effect: ${describeCursor(start.cursor)} — unset it after this deploy`,
      )
      break
    case 'live-tail':
      console.log('[ingester] live tail (dev): ignoring stored cursors')
      break
    case 'same-host-seq':
      console.log(
        `[ingester] resuming ${serviceKey} from ${describeCursor(start.cursor)}${stale}`,
      )
      break
    case 'cutover':
      console.log(
        `[ingester] cutover: no fresh cursor for ${serviceKey}; seeding from ${start.from?.service} last advanced at ${start.from?.updatedAt.toISOString()} (${describeCursor(start.cursor)})`,
      )
      break
    case 'none':
      console.log('[ingester] no stored cursor; starting from the live head')
      break
  }
  if (start.staleMs !== undefined && start.staleMs > CURSOR_STALE_WARN_MS) {
    console.warn(
      `[ingester] stored cursor last advanced ${(start.staleMs / 3_600_000).toFixed(1)}h ago — replaying backlog; if this recurs, check why the ingester was down`,
    )
  }
}

export async function createIngester(
  opts: CreateIngesterOpts,
): Promise<IngesterRuntime> {
  const { db, service, hooks = defaultHooks, liveTail = false } = opts
  const serviceKey = jetstreamServiceKey(service)
  const onFatal =
    opts.onFatal ??
    ((err: Error) => {
      console.error('[ingester] FATAL', err)
      process.exit(1)
    })

  const deps: IngesterDeps = {
    source: (o) =>
      new Jetstream(service).live({
        ...o,
        collections: [...INGEST_COLLECTIONS] as CollectionFilter[],
        kinds: [...INGEST_KINDS],
        raw: true,
        liveTransport: websocketTransport({
          onReconnect: (err, { attempt }) =>
            console.warn(
              `[ingester] jetstream reconnecting (attempt ${attempt})`,
              err,
            ),
        }),
      }),
    loadRows: () => loadCursorStates(db),
    persistCursor: (seq) => saveCursor(db, serviceKey, seq),
    handle: (ingestEvt) => {
      const label = ingestEventLabel(ingestEvt)
      // The runner marks an event complete as soon as this returns — even on a thrown
      // error — so a failed event would otherwise vanish. Retry transient failures first
      // (writes are idempotent); if they're exhausted, dead-letter the event for replay;
      // if even that fails (DB down), escalate via onFatal rather than silently skip it.
      return runWithDeadLetter({
        label,
        run: () =>
          withRetry(() => handleIngestEvent(db, ingestEvt, hooks), {
            attempts: 5,
            baseDelayMs: 100,
            label,
          }),
        deadLetter: async (err) => {
          await recordFailedEvent(
            db,
            toFailedEventInput(ingestEvt),
            err instanceof Error ? err.message : String(err),
          )
          console.error(
            `[ingester] dead-lettered ${label} (seq ${ingestEvt.seq}) after retries`,
            err,
          )
        },
        onFatal,
      })
    },
    now: Date.now,
    sleep: abortableSleep,
    ...opts.deps,
  }

  // Rows are loaded even under an override: they are the fallback basis if the
  // override itself is rejected (see fallbackCursor).
  const rows = liveTail ? [] : await deps.loadRows()
  const start = resolveStartCursor({
    liveTail,
    override: opts.startCursor,
    serviceKey,
    rows,
    now: deps.now(),
  })
  logStart(start, serviceKey)

  // Positions the timestamp-form fallback can be built from, best first:
  //  - the wire `time` of the last contiguously-completed event (exact, no clock
  //    assumptions — survives a rejection that lands mid-backlog);
  //  - failing that, the freshest stored row's wall-clock `updated_at` (only valid
  //    if that row was written at the live head — the documented cutover caveat).
  const pendingEventTimes = new Map<number, number>()
  let lastCompletedEventTime: number | undefined
  const freshestRow = rows.reduce<CursorRow | undefined>(
    (best, r) => (!best || r.updatedAt > best.updatedAt ? r : best),
    undefined,
  )
  const storedBasisTime = (start.from ?? freshestRow)?.updatedAt.getTime()
  let useTimestampForm = false

  const cursorWriter = makeThrottledCursorWriter(
    deps.persistCursor,
    CURSOR_INTERVAL_MS,
  )
  // MemoryRunner advances setCursor only on consecutively-completed events (in
  // delivery order, not numeric order — Jetstream seqs are sparse after filtering),
  // so the persisted seq is gapless even with per-DID concurrency.
  const runner = new MemoryRunner({
    startCursor: start.cursor,
    concurrency: opts.concurrency ?? DEFAULT_CONCURRENCY,
    setCursor: async (seq) => {
      const t = pendingEventTimes.get(seq)
      if (t !== undefined) lastCompletedEventTime = t
      // Delivery order is ascending seq, so everything at or before `seq` is done.
      for (const k of pendingEventTimes.keys()) {
        if (k > seq) break
        pendingEventTimes.delete(k)
      }
      cursorWriter.record(seq)
    },
  })

  const currentCursor = (): number | undefined =>
    runner.getCursor() ?? start.cursor

  const fallbackCursor = (): number | undefined => {
    const current = currentCursor()
    // A timestamp is never "too old" in the 400 sense (the server clamps it and
    // advises), so a rejected timestamp — e.g. an operator override — is retried as is.
    if (current !== undefined && isTimestampCursor(current)) return current
    if (lastCompletedEventTime !== undefined) {
      return timestampCursor(new Date(lastCompletedEventTime))
    }
    if (storedBasisTime === undefined) {
      console.error(
        '[ingester] no known position to fall back to; reconnecting at the live head — events between the rejected cursor and now are LOST',
      )
      return undefined
    }
    // A seq the server refused as too old lies before its retention window, so
    // everything from there to the window's start is LOST whatever we do. The stored
    // row's updated_at is wall-clock — exact only if the row was written at the live
    // head; written mid-replay, it also skips the events between the window and that
    // time. Say so here: the server only speaks up (OutdatedCursor) if the timestamp
    // is too old as well.
    console.error(
      `[ingester] seq ${current} is below Jetstream's retention window (HTTP 400): events before the window are LOST. Resuming from the stored row's wall-clock position ${new Date(storedBasisTime).toISOString()} − ${CUTOVER_MARGIN_MS / 1000}s; if that row was written mid-replay rather than at the live head, events between the window and that time are skipped too`,
    )
    return timestampCursor(new Date(storedBasisTime))
  }

  // live() only ever loads from this store (persistence is ours, above). Serving
  // the runner's cursor here also makes our own restart loop resume correctly.
  const cursorStore: CursorStore = {
    load: async () => (useTimestampForm ? fallbackCursor() : currentCursor()),
    save: async () => {},
  }

  const onInfo = (info: { name: string; message?: string }): void => {
    if (info.name === 'OutdatedCursor') {
      console.error(
        "[ingester] OutdatedCursor: the cursor was older than Jetstream's window and was clamped — events in the gap are LOST and affected repos need re-backfill",
        info.message,
      )
    } else {
      console.warn(`[ingester] jetstream advisory ${info.name}`, info.message)
    }
  }
  const onError = (err: Error): void => {
    console.error('[ingester] jetstream error', err)
  }

  const abort = new AbortController()
  let running: Promise<void> | undefined

  // A below-retention *seq* is refused at the websocket handshake (HTTP 400) and the
  // SDK gives up — no advisory is ever sent. A too-old *timestamp*, by contrast, is
  // clamped with an OutdatedCursor advisory. So when a connect is refused with a 400
  // before delivering anything, the next attempt uses the timestamp form of the last
  // known position, and a cursor-too-old rejection resolves loudly instead of looping
  // forever. Every other failure keeps the seq. The SDK already redials transient
  // network trouble and 5xx on its own, so what reaches this loop is a 4xx it treats
  // as permanent (429 rate-limit, 401/403) or a protocol-fatal close: a transient one
  // must not move the position — the stored row's wall-clock time is only exact if it
  // was written at the live head — and a permanent one keeps failing under a capped
  // backoff: never silent, never tight. A rejection that lands mid-stream likewise
  // retries the seq itself: the server was serving it moments ago, so it cannot be
  // too old, and a backlog replay must never be abandoned for the wall clock.
  async function run(signal: AbortSignal): Promise<void> {
    let attempt = 0
    while (!signal.aborted) {
      let delivered = false
      try {
        for await (const evt of deps.source({
          cursor: cursorStore,
          signal,
          onError,
          onInfo,
        })) {
          delivered = true
          attempt = 0
          const ingestEvt = toIngestEvent(evt)
          if (!ingestEvt) continue
          const eventTime = Date.parse(evt.time)
          if (Number.isFinite(eventTime)) {
            pendingEventTimes.set(ingestEvt.seq, eventTime)
          }
          void runner
            .trackEvent(ingestEvt.did, ingestEvt.seq, () =>
              deps.handle(ingestEvt),
            )
            .catch((err: unknown) =>
              onFatal(err instanceof Error ? err : new Error(String(err))),
            )
        }
        return
      } catch (err) {
        if (signal.aborted) return
        attempt += 1
        const status = handshakeRejectionStatus(err)
        useTimestampForm = !delivered && status === 400
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** (attempt - 1),
          RECONNECT_MAX_MS,
        )
        console.error(
          `[ingester] jetstream connection rejected (attempt ${attempt}${status === undefined ? '' : `, HTTP ${status}`}); retrying in ${delay}ms with ${useTimestampForm ? 'a timestamp cursor' : 'the same seq'}`,
          err,
        )
        await deps.sleep(delay, signal)
      }
    }
  }

  return {
    async start() {
      console.log(
        `[ingester] connecting to ${service} from ${describeCursor(start.cursor)} (${start.source})`,
      )
      running = run(abort.signal)
    },
    async stop() {
      abort.abort()
      await running
      // Drain in-flight AND queued handlers rather than runner.destroy(): destroy()
      // clears queued per-DID tasks while their wrappers stay pending, which can hang
      // forever — and dropping them would only mean redelivery on restart anyway.
      await runner.processAll()
      await cursorWriter.flush()
      console.log('[ingester] stopped, cursor flushed')
    },
  }
}
