import { describe, expect, it, vi } from 'vitest'

import { JAM_NSID } from '@onrepeat/lexicons'

import type { IngestEvent, JetstreamEvent } from './events'
import {
  abortableSleep,
  createIngester,
  DEFAULT_JETSTREAM_URL,
  type LiveSource,
  type LiveSourceOpts,
} from './jetstream'
import type { CursorRow } from './start-cursor'

const HOST_KEY = 'jetstream:jetstream.us-west.bsky.network'
const T = Date.parse('2026-10-17T12:00:00.000Z')
const row = (
  service: string,
  cursor: number,
  updatedAt: number,
): CursorRow => ({
  service,
  cursor,
  updatedAt: new Date(updatedAt),
})

function jsCommit(p: {
  did?: string
  seq: number
  operation: 'create' | 'update' | 'delete'
  collection: string
  /** Wire event time (RFC 3339); defaults to a non-parsable placeholder. */
  time?: string
}): JetstreamEvent {
  const did = p.did ?? 'did:plc:author'
  const commit =
    p.operation === 'delete'
      ? { operation: 'delete', collection: p.collection, rkey: 'r', rev: 'v' }
      : {
          operation: p.operation,
          collection: p.collection,
          rkey: 'r',
          rev: 'v',
          cid: 'bafyrecord',
          record: { $type: p.collection },
        }
  return {
    kind: 'commit',
    did,
    seq: p.seq,
    time: p.time ?? 't',
    commit,
  } as unknown as JetstreamEvent
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const noSleep = async (): Promise<void> => {}

/**
 * A stand-in for Jetstream.live(): each call yields the next batch (or throws,
 * when the batch is a thrower; or yields its events and THEN throws, for a
 * mid-stream rejection; or yields its events and THEN ends, for a stream that
 * closes on its own), then stays open until the signal aborts — the way a
 * live websocket stream behaves.
 */
type Batch =
  | JetstreamEvent[]
  | (() => never)
  | { events: JetstreamEvent[]; thenThrow: Error }
  | { events: JetstreamEvent[]; thenEnd: true }
function fakeSource(
  batches: Batch[],
  hooks: { beforeYield?: (o: LiveSourceOpts) => void } = {},
): { source: LiveSource; calls: LiveSourceOpts[]; firstCall: Promise<void> } {
  const calls: LiveSourceOpts[] = []
  const first = deferred()
  const source: LiveSource = (opts) => {
    calls.push(opts)
    if (calls.length === 1) first.resolve()
    const batch = batches[calls.length - 1] ?? []
    return (async function* () {
      if (typeof batch === 'function') {
        batch()
        return
      }
      hooks.beforeYield?.(opts)
      if (!Array.isArray(batch)) {
        for (const evt of batch.events) yield evt
        if ('thenThrow' in batch) throw batch.thenThrow
        return
      }
      for (const evt of batch) yield evt
      await new Promise<void>((resolve) => {
        if (opts.signal?.aborted) return resolve()
        opts.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    })()
  }
  return { source, calls, firstCall: first.promise }
}

describe('createIngester (jetstream)', () => {
  it('constructs in live-tail mode without touching the db or the network', async () => {
    const loadRows = vi.fn()
    const source = vi.fn()
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      liveTail: true,
      deps: { loadRows, source },
    })
    expect(loadRows).not.toHaveBeenCalled()
    expect(source).not.toHaveBeenCalled()
    expect(typeof ing.start).toBe('function')
    expect(typeof ing.stop).toBe('function')
  })

  it('hands the resolved start cursor to the source and treats save as a no-op', async () => {
    const persistCursor = vi.fn(async () => {})
    const src = fakeSource([[]])
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      deps: {
        source: src.source,
        loadRows: async () => [row(HOST_KEY, 42, T)],
        persistCursor,
        now: () => T,
        sleep: noSleep,
      },
    })
    await ing.start()
    await src.firstCall
    expect(await src.calls[0]!.cursor!.load()).toBe(42)
    await src.calls[0]!.cursor!.save(99)
    expect(persistCursor).not.toHaveBeenCalled()
    await ing.stop()
  })

  it('warns when the stored cursor last advanced more than 6h ago', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const src = fakeSource([[]])
    await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      deps: {
        source: src.source,
        loadRows: async () => [row(HOST_KEY, 42, T - 7 * 3_600_000)],
        persistCursor: async () => {},
        now: () => T,
        sleep: noSleep,
      },
    })
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('last advanced 7.0h ago — replaying backlog'),
    )
    warn.mockRestore()
  })

  it('logs the cutover when only a firehose row is stored', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const src = fakeSource([[]])
    await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      deps: {
        source: src.source,
        loadRows: async () => [row('firehose', 9, T - 5000)],
        persistCursor: async () => {},
        now: () => T,
        sleep: noSleep,
      },
    })
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        `cutover: no fresh cursor for ${HOST_KEY}; seeding from firehose last advanced at 2026-10-17T11:59:55.000Z`,
      ),
    )
    log.mockRestore()
  })

  it('routes events through the handler in per-DID order and persists the last contiguous seq', async () => {
    const order: string[] = []
    const gate = deferred() // A:1 blocks until released
    const handle = vi.fn(async (e: IngestEvent) => {
      if (e.seq === 1) await gate.promise
      order.push(`${e.did}:${e.seq}`)
    })
    const persistCursor = vi.fn(async () => {})
    const src = fakeSource([
      [
        jsCommit({
          did: 'did:plc:a',
          seq: 1,
          operation: 'create',
          collection: JAM_NSID,
        }),
        jsCommit({
          did: 'did:plc:b',
          seq: 2,
          operation: 'create',
          collection: JAM_NSID,
        }),
        jsCommit({
          did: 'did:plc:a',
          seq: 3,
          operation: 'delete',
          collection: JAM_NSID,
        }),
      ],
    ])
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      liveTail: true,
      deps: { source: src.source, handle, persistCursor, sleep: noSleep },
    })
    await ing.start()
    // A:1 (blocked) and B:2 have started; A:3 waits behind A:1 in its DID partition.
    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(2))
    expect(order).toEqual(['did:plc:b:2'])
    gate.resolve()
    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(3))
    await ing.stop()
    expect(order).toEqual(['did:plc:b:2', 'did:plc:a:1', 'did:plc:a:3'])
    expect(persistCursor).toHaveBeenLastCalledWith(3)
  })

  it('skips events the normalizer rejects without advancing the cursor', async () => {
    const handle = vi.fn(async () => {})
    const persistCursor = vi.fn(async () => {})
    const src = fakeSource([
      [
        {
          kind: 'identity',
          did: 'did:plc:a',
          seq: 1,
          time: 't',
          identity: { did: 'did:plc:a' },
        } as unknown as JetstreamEvent,
        jsCommit({
          operation: 'create',
          collection: 'app.bsky.feed.post',
          seq: 2,
        }),
      ],
    ])
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      liveTail: true,
      deps: { source: src.source, handle, persistCursor, sleep: noSleep },
    })
    await ing.start()
    await src.firstCall
    await ing.stop()
    expect(handle).not.toHaveBeenCalled()
    expect(persistCursor).not.toHaveBeenCalled()
  })

  it('after a rejected connect, backs off and retries with the timestamp form of the last known position', async () => {
    const sleep = vi.fn(async () => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const src = fakeSource([
      () => {
        throw new Error('Unexpected server response: 400')
      },
      [],
    ])
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      deps: {
        source: src.source,
        loadRows: async () => [row(HOST_KEY, 42, T - 1000)],
        now: () => T,
        sleep,
        persistCursor: async () => {},
      },
    })
    await ing.start()
    await vi.waitFor(() => expect(src.calls).toHaveLength(2))
    expect(sleep).toHaveBeenCalledWith(3000, expect.any(AbortSignal))
    expect(await src.calls[1]!.cursor!.load()).toBe((T - 1000 - 60_000) * 1000)
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('connection rejected'),
      expect.any(Error),
    )
    await ing.stop()
    err.mockRestore()
  })

  it('caps the backoff at 60s and stops promptly from inside a backoff', async () => {
    const delays: number[] = []
    const sleep = vi.fn(async (ms: number, signal: AbortSignal) => {
      delays.push(ms)
      if (delays.length === 6) {
        await new Promise<void>((r) =>
          signal.addEventListener('abort', () => r(), { once: true }),
        )
      }
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const src = fakeSource(
      Array.from({ length: 7 }, () => () => {
        throw new Error('boom')
      }),
    )
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      liveTail: true,
      deps: { source: src.source, sleep, persistCursor: async () => {} },
    })
    await ing.start()
    await vi.waitFor(() => expect(delays).toHaveLength(6))
    await ing.stop()
    expect(delays).toEqual([3000, 6000, 12000, 24000, 48000, 60000])
    err.mockRestore()
  })

  it('logs OutdatedCursor advisories at error level', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const src = fakeSource([[]], {
      beforeYield: (o) =>
        o.onInfo?.({ name: 'OutdatedCursor', message: 'clamped' }),
    })
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      liveTail: true,
      deps: {
        source: src.source,
        sleep: noSleep,
        persistCursor: async () => {},
      },
    })
    await ing.start()
    await src.firstCall
    await ing.stop()
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('OutdatedCursor'),
      'clamped',
    )
    err.mockRestore()
  })

  it('a rejection after delivered events retries with the seq, not a timestamp', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const persistCursor = vi.fn(async () => {})
    const handle = vi.fn(async () => {})
    const src = fakeSource([
      {
        events: [
          jsCommit({ seq: 50, operation: 'create', collection: JAM_NSID }),
        ],
        thenThrow: new Error('mid-stream 429'),
      },
      [],
    ])
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      deps: {
        source: src.source,
        loadRows: async () => [row(HOST_KEY, 42, T - 1000)],
        handle,
        persistCursor,
        now: () => T,
        sleep: noSleep,
      },
    })
    await ing.start()
    await vi.waitFor(() => expect(persistCursor).toHaveBeenCalledWith(50))
    await vi.waitFor(() => expect(src.calls).toHaveLength(2))
    expect(await src.calls[1]!.cursor!.load()).toBe(50)
    await ing.stop()
    err.mockRestore()
  })

  it('a rejection with nothing delivered falls back to the completed event time, not the wall clock', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const persistCursor = vi.fn(async () => {})
    const eventTime = '2026-10-17T11:00:00.000Z'
    const src = fakeSource([
      {
        events: [
          jsCommit({
            seq: 50,
            operation: 'create',
            collection: JAM_NSID,
            time: eventTime,
          }),
        ],
        thenThrow: new Error('mid-stream 429'),
      },
      () => {
        throw new Error('Unexpected server response: 400')
      },
      [],
    ])
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      deps: {
        source: src.source,
        loadRows: async () => [row(HOST_KEY, 42, T - 1000)],
        handle: async () => {},
        persistCursor,
        now: () => T,
        sleep: noSleep,
      },
    })
    await ing.start()
    await vi.waitFor(() => expect(persistCursor).toHaveBeenCalledWith(50))
    await vi.waitFor(() => expect(src.calls).toHaveLength(3))
    expect(await src.calls[2]!.cursor!.load()).toBe(
      (Date.parse(eventTime) - 60_000) * 1000,
    )
    await ing.stop()
    err.mockRestore()
  })

  it('a rejected timestamp override is retried unchanged', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const override = 1792000000000000
    const src = fakeSource([
      () => {
        throw new Error('Unexpected server response: 429')
      },
      [],
    ])
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      startCursor: override,
      deps: {
        source: src.source,
        loadRows: async () => [],
        persistCursor: async () => {},
        now: () => T,
        sleep: noSleep,
      },
    })
    await ing.start()
    await vi.waitFor(() => expect(src.calls).toHaveLength(2))
    expect(await src.calls[1]!.cursor!.load()).toBe(override)
    await ing.stop()
    err.mockRestore()
  })

  it('a rejected seq override falls back to the freshest stored row time', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const src = fakeSource([
      () => {
        throw new Error('Unexpected server response: 400')
      },
      [],
    ])
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      startCursor: 1,
      deps: {
        source: src.source,
        loadRows: async () => [row('firehose', 9, T - 5000)],
        persistCursor: async () => {},
        now: () => T,
        sleep: noSleep,
      },
    })
    await ing.start()
    await vi.waitFor(() => expect(src.calls).toHaveLength(2))
    expect(await src.calls[1]!.cursor!.load()).toBe((T - 5000 - 60_000) * 1000)
    await ing.stop()
    err.mockRestore()
  })

  it('a fallback to the live head is logged at error level as a gap', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const src = fakeSource([
      () => {
        throw new Error('Unexpected server response: 400')
      },
      [],
    ])
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      liveTail: true,
      deps: {
        source: src.source,
        persistCursor: async () => {},
        sleep: noSleep,
      },
    })
    await ing.start()
    await vi.waitFor(() => expect(src.calls).toHaveLength(2))
    expect(await src.calls[1]!.cursor!.load()).toBeUndefined()
    expect(err).toHaveBeenCalledWith(expect.stringContaining('LOST'))
    await ing.stop()
    err.mockRestore()
  })

  it('reconnects with the same seq when the stream ends without an abort', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sleep = vi.fn(async () => {})
    const persistCursor = vi.fn(async () => {})
    const src = fakeSource([
      {
        events: [
          jsCommit({ seq: 50, operation: 'create', collection: JAM_NSID }),
        ],
        thenEnd: true,
      },
      [],
    ])
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      deps: {
        source: src.source,
        loadRows: async () => [row(HOST_KEY, 42, T - 1000)],
        handle: async () => {},
        persistCursor,
        now: () => T,
        sleep,
      },
    })
    await ing.start()
    await vi.waitFor(() => expect(persistCursor).toHaveBeenCalledWith(50))
    await vi.waitFor(() => expect(src.calls).toHaveLength(2))
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('stream ended unexpectedly'),
    )
    expect(sleep).toHaveBeenCalledWith(3000, expect.any(AbortSignal))
    expect(await src.calls[1]!.cursor!.load()).toBe(50)
    await ing.stop()
    err.mockRestore()
  })

  it('does not queue events delivered after stop() begins', async () => {
    const handle = vi.fn(async () => {})
    const gate = deferred() // holds the stream between seq 1 and seq 2
    const source: LiveSource = () =>
      (async function* () {
        yield jsCommit({ seq: 1, operation: 'create', collection: JAM_NSID })
        await gate.promise
        yield jsCommit({ seq: 2, operation: 'create', collection: JAM_NSID })
      })()
    const ing = await createIngester({
      db: {} as never,
      service: DEFAULT_JETSTREAM_URL,
      liveTail: true,
      deps: { source, handle, persistCursor: async () => {}, sleep: noSleep },
    })
    await ing.start()
    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(1))
    const stopping = ing.stop()
    gate.resolve() // seq 2 arrives after the abort
    await stopping
    expect(handle).toHaveBeenCalledTimes(1)
  })
})

describe('abortableSleep', () => {
  it('resolves early on abort', async () => {
    const ac = new AbortController()
    const t0 = Date.now()
    setTimeout(() => ac.abort(), 10)
    await abortableSleep(5000, ac.signal)
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it('resolves immediately when already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(abortableSleep(5000, ac.signal)).resolves.toBeUndefined()
  })
})
