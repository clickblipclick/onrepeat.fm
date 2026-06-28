import { IdResolver, MemoryCache } from '@atproto/identity'
import {
  Firehose,
  FirehoseValidationError,
  MemoryRunner,
  type Event,
} from '@atproto/sync'

import { recordFailedEvent, type DB } from '@onrepeat/db'
import { FOLLOW_NSID, JAM_NSID, LIKE_NSID, PROFILE_NSID } from '@onrepeat/lexicons'

import {
  loadCursorState,
  makeThrottledCursorWriter,
  saveCursor,
} from './cursor'
import { runWithDeadLetter } from './dead-letter'
import { ingestEventLabel, toFailedEventInput, toIngestEvent } from './events'
import { defaultHooks, type IngesterHooks } from './hooks'
import { handleIngestEvent } from './indexer'
import { withRetry } from './retry'

const SERVICE = 'firehose'
const CURSOR_INTERVAL_MS = 5000
// Cap concurrent in-flight handlers. MemoryRunner defaults to Infinity, so a backlog replay
// (resume from a stale cursor) could open unbounded concurrent DB writes and balloon the
// in-flight set. Keep this ≤ the DB pool size (createDb defaults to pg's max 10).
const DEFAULT_CONCURRENCY = 8
// Resuming from a cursor older than the relay's backfill window (~72h on bsky.network)
// silently skips the gap — @atproto/sync 0.3 surfaces no OutdatedCursor signal. Warn
// well before that so a stalled ingester gets noticed, and shout when the window is
// likely blown (affected repos then need a re-backfill to reconcile).
const CURSOR_STALE_WARN_MS = 6 * 60 * 60 * 1000
const CURSOR_STALE_GAP_MS = 72 * 60 * 60 * 1000

export interface IngesterRuntime {
  start(): Promise<void>
  stop(): Promise<void>
}

export interface CreateIngesterOpts {
  db: DB
  /** Relay websocket URL, e.g. wss://bsky.network */
  relay: string
  hooks?: IngesterHooks
  /** Dev: ignore the stored cursor and start at the live head instead of replaying the
   *  backlog. Prod leaves this off so restarts resume from the persisted cursor. */
  liveTail?: boolean
  /** Last-resort handler when an event can't even be dead-lettered (e.g. DB down). Default:
   *  log and exit(1) so the process restarts and resumes from the persisted cursor. */
  onFatal?: (err: Error) => void
  /** Max concurrent in-flight event handlers. Keep ≤ the DB pool size. Default 8. */
  concurrency?: number
}

export async function createIngester(
  opts: CreateIngesterOpts,
): Promise<IngesterRuntime> {
  const { db, relay, hooks = defaultHooks, liveTail = false } = opts
  const onFatal =
    opts.onFatal ??
    ((err: Error) => {
      console.error('[ingester] FATAL', err)
      process.exit(1)
    })
  // Cache DID resolutions: every relevant commit triggers a DID lookup to verify the
  // commit signature (parseCommitAuthenticated). Without a cache that's a network
  // round-trip per jam/like event, coupling stream throughput to PLC latency. Defaults
  // to 1h stale / 24h max TTL.
  const idResolver = new IdResolver({ didCache: new MemoryCache() })
  const cursorState = liveTail ? undefined : await loadCursorState(db, SERVICE)
  const startCursor = cursorState?.cursor
  if (cursorState) {
    const staleMs = Date.now() - cursorState.updatedAt.getTime()
    const staleHours = (staleMs / 3_600_000).toFixed(1)
    if (staleMs > CURSOR_STALE_GAP_MS) {
      console.error(
        `[ingester] cursor last advanced ${staleHours}h ago — likely past the relay backfill window; events in the gap are LOST and affected repos need re-backfill`,
      )
    } else if (staleMs > CURSOR_STALE_WARN_MS) {
      console.warn(
        `[ingester] cursor last advanced ${staleHours}h ago — replaying backlog; if this recurs, check why the ingester was down`,
      )
    }
  }

  const cursorWriter = makeThrottledCursorWriter(
    (seq) => saveCursor(db, SERVICE, seq),
    CURSOR_INTERVAL_MS,
  )

  // MemoryRunner advances setCursor only on consecutively-completed events,
  // so the persisted seq is gapless even with per-DID concurrency.
  const runner = new MemoryRunner({
    startCursor,
    concurrency: opts.concurrency ?? DEFAULT_CONCURRENCY,
    setCursor: async (seq) => cursorWriter.record(seq),
  })

  const firehose = new Firehose({
    service: relay,
    idResolver,
    // Pass `runner` OR `getCursor`, never both — the Firehose constructor throws if both
    // are set. MemoryRunner already seeds its cursor from startCursor, so runner alone
    // resumes correctly (and advances as events complete).
    runner,
    filterCollections: [JAM_NSID, LIKE_NSID, PROFILE_NSID, FOLLOW_NSID],
    // Identity events stay excluded ON PURPOSE: @atproto/sync resolves the DID
    // document for EVERY identity event before handing it to us — network-wide,
    // that's a PLC round-trip per event for repos we mostly don't track, and it
    // fills the unbounded MemoryCache with the whole network's DID docs. Key
    // rotation is already handled: commit verification retries with a forced
    // key refresh on signature failure.
    excludeIdentity: true,
    // Account events are cheap to parse (no resolution) and required so we stop
    // serving content of deactivated/taken-down/deleted accounts.
    excludeAccount: false,
    excludeSync: true,
    handleEvent: async (evt: Event) => {
      const ingestEvt = toIngestEvent(evt)
      if (!ingestEvt) return
      const label = ingestEventLabel(ingestEvt)
      // @atproto/sync advances the cursor as soon as this returns — even on a thrown error —
      // so a failed event would otherwise vanish. Retry transient failures first (writes are
      // idempotent); if they're exhausted, dead-letter the event for replay; if even that
      // fails (DB down), escalate via onFatal rather than silently skip it.
      await runWithDeadLetter({
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
    onError: (err: Error) => {
      // A malformed upstream event (e.g. a PDS emitting a CID where a rev/TID is
      // expected) fails lexicon validation. @atproto/sync skips it and the stream keeps
      // running, so log a concise warning instead of dumping the full multi-KB event
      // (which embeds the raw `blocks` bytes). Frequent ones would hint at protocol skew.
      if (err instanceof FirehoseValidationError) {
        const v = err.value as { repo?: string; seq?: number } | undefined
        const reason =
          err.cause instanceof Error ? err.cause.message : err.cause
        console.warn(
          `[ingester] skipped invalid firehose event (repo=${v?.repo ?? '?'} seq=${v?.seq ?? '?'}): ${reason}`,
        )
        return
      }
      console.error('[ingester] firehose error', err)
    },
  })

  return {
    async start() {
      console.log(
        `[ingester] connecting to ${relay} from cursor ${startCursor ?? 'live tail'}`,
      )
      firehose.start()
    },
    async stop() {
      await firehose.destroy()
      await runner.destroy() // drain in-flight handler tasks so flush() captures the final seq
      await cursorWriter.flush()
      console.log('[ingester] stopped, cursor flushed')
    },
  }
}
