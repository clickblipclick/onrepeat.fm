import {
  Firehose,
  MemoryRunner,
  FirehoseValidationError,
  type Event,
} from '@atproto/sync'
import { IdResolver, MemoryCache } from '@atproto/identity'
import type { DB } from '@onrepeat/db'
import { JAM_NSID, LIKE_NSID } from '@onrepeat/lexicons'
import { toIngestEvent } from './events'
import { handleIngestEvent } from './indexer'
import { withRetry } from './retry'
import { loadCursor, saveCursor, makeThrottledCursorWriter } from './cursor'
import { defaultHooks, type IngesterHooks } from './hooks'

const SERVICE = 'firehose'
const CURSOR_INTERVAL_MS = 5000

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
}

export async function createIngester(
  opts: CreateIngesterOpts,
): Promise<IngesterRuntime> {
  const { db, relay, hooks = defaultHooks, liveTail = false } = opts
  // Cache DID resolutions: every relevant commit triggers a DID lookup to verify the
  // commit signature (parseCommitAuthenticated). Without a cache that's a network
  // round-trip per jam/like event, coupling stream throughput to PLC latency. Defaults
  // to 1h stale / 24h max TTL.
  const idResolver = new IdResolver({ didCache: new MemoryCache() })
  const startCursor = liveTail ? undefined : await loadCursor(db, SERVICE)

  const cursorWriter = makeThrottledCursorWriter(
    (seq) => saveCursor(db, SERVICE, seq),
    CURSOR_INTERVAL_MS,
  )

  // MemoryRunner advances setCursor only on consecutively-completed events,
  // so the persisted seq is gapless even with per-DID concurrency.
  const runner = new MemoryRunner({
    startCursor,
    setCursor: async (seq) => cursorWriter.record(seq),
  })

  const firehose = new Firehose({
    service: relay,
    idResolver,
    // Pass `runner` OR `getCursor`, never both — the Firehose constructor throws if both
    // are set. MemoryRunner already seeds its cursor from startCursor, so runner alone
    // resumes correctly (and advances as events complete).
    runner,
    filterCollections: [JAM_NSID, LIKE_NSID],
    excludeIdentity: true,
    excludeAccount: true,
    excludeSync: true,
    handleEvent: async (evt: Event) => {
      const ingestEvt = toIngestEvent(evt)
      if (!ingestEvt) return
      // @atproto/sync swallows handler errors and advances the cursor regardless, so a
      // transient DB failure would silently skip this event. Our writes are idempotent,
      // so retry a few times first. If all attempts fail (sustained outage) the event is
      // skipped and logged via onError — recover by re-running from an earlier cursor.
      await withRetry(() => handleIngestEvent(db, ingestEvt, hooks), {
        attempts: 5,
        baseDelayMs: 100,
        label: `${ingestEvt.action} ${ingestEvt.uri}`,
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
