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

  const rows =
    liveTail || opts.startCursor !== undefined ? [] : await deps.loadRows()
  const start = resolveStartCursor({
    liveTail,
    override: opts.startCursor,
    serviceKey,
    rows,
    now: deps.now(),
  })
  logStart(start, serviceKey)

  // Wall-clock time of the freshest position we know. Feeds the timestamp-form
  // cursor used when a seq is rejected as too old (see run()).
  let lastAdvancedAt: number | undefined = start.from?.updatedAt.getTime()
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
      lastAdvancedAt = deps.now()
      cursorWriter.record(seq)
    },
  })

  const fallbackCursor = (): number | undefined => {
    if (lastAdvancedAt === undefined) {
      console.warn(
        '[ingester] no known position to fall back to; reconnecting at the live head',
      )
      return undefined
    }
    return timestampCursor(new Date(lastAdvancedAt))
  }

  // live() only ever loads from this store (persistence is ours, above). Serving
  // the runner's cursor here also makes our own restart loop resume correctly.
  const cursorStore: CursorStore = {
    load: async () =>
      useTimestampForm
        ? fallbackCursor()
        : (runner.getCursor() ?? start.cursor),
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
  // clamped with an OutdatedCursor advisory. So after any rejected connect we retry
  // with the timestamp form of the last known position: a cursor-too-old rejection
  // then resolves loudly instead of looping forever, and any other fatal error keeps
  // failing under a capped backoff — never silent, never tight.
  async function run(signal: AbortSignal): Promise<void> {
    let attempt = 0
    while (!signal.aborted) {
      try {
        for await (const evt of deps.source({
          cursor: cursorStore,
          signal,
          onError,
          onInfo,
        })) {
          attempt = 0
          useTimestampForm = false
          const ingestEvt = toIngestEvent(evt)
          if (!ingestEvt) continue
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
        useTimestampForm = true
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** (attempt - 1),
          RECONNECT_MAX_MS,
        )
        console.error(
          `[ingester] jetstream connection rejected (attempt ${attempt}); retrying in ${delay}ms with a timestamp cursor`,
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
