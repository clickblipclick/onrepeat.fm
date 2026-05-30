import { Firehose, MemoryRunner, type Event } from '@atproto/sync'
import { IdResolver } from '@atproto/identity'
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
}

export async function createIngester(opts: CreateIngesterOpts): Promise<IngesterRuntime> {
  const { db, relay, hooks = defaultHooks } = opts
  const idResolver = new IdResolver()
  const startCursor = await loadCursor(db, SERVICE)

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
    onError: (err: Error) => console.error('[ingester] firehose error', err),
  })

  return {
    async start() {
      console.log(`[ingester] connecting to ${relay} from cursor ${startCursor ?? 'live tail'}`)
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
