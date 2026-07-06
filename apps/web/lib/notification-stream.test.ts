import { describe, expect, it } from 'vitest'

import { createNotificationStream } from './notification-stream'

/** Drain a stream in the background, exposing the decoded text so far. */
function collect(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder()
  const state = { text: '', done: false }
  void (async () => {
    const reader = stream.getReader()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      state.text += decoder.decode(value)
    }
    state.done = true
  })()
  return state
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10))
  }
}

function deferredCounts() {
  const resolvers: Array<(n: number) => void> = []
  const getUnreadCount = () =>
    new Promise<number>((resolve) => resolvers.push(resolve))
  return { resolvers, getUnreadCount }
}

const noopSubscribe = (_onNotify: () => void) => () => {}

describe('createNotificationStream', () => {
  it('sends the current unread count as the first event', async () => {
    const out = collect(
      createNotificationStream({
        subscribe: noopSubscribe,
        getUnreadCount: async () => 3,
        signal: new AbortController().signal,
      }),
    )

    await waitFor(() => out.text.includes('data:'))
    expect(out.text).toContain('data: {"unread":3}\n\n')
  })

  it('sends a refreshed count when a notification arrives', async () => {
    let count = 3
    let notify: () => void = () => {}
    const out = collect(
      createNotificationStream({
        subscribe: (onNotify) => {
          notify = onNotify
          return () => {}
        },
        getUnreadCount: async () => count,
        signal: new AbortController().signal,
      }),
    )
    await waitFor(() => out.text.includes('{"unread":3}'))

    count = 5
    notify()

    await waitFor(() => out.text.includes('{"unread":5}'))
    expect(out.text).toContain('data: {"unread":5}\n\n')
  })

  it('coalesces a burst of notifications into one trailing refresh', async () => {
    const { resolvers, getUnreadCount } = deferredCounts()
    let calls = 0
    let notify: () => void = () => {}
    const out = collect(
      createNotificationStream({
        subscribe: (onNotify) => {
          notify = onNotify
          return () => {}
        },
        getUnreadCount: () => {
          calls++
          return getUnreadCount()
        },
        signal: new AbortController().signal,
      }),
    )
    await waitFor(() => calls === 1)

    // Burst while the initial count query is still in flight.
    notify()
    notify()
    notify()
    resolvers[0]!(1)

    // The burst collapses into a single follow-up query.
    await waitFor(() => calls === 2)
    resolvers[1]!(4)
    await waitFor(() => out.text.includes('{"unread":4}'))
    expect(calls).toBe(2)
    expect(out.text).toContain('data: {"unread":1}\n\n')
    expect(out.text).toContain('data: {"unread":4}\n\n')
  })

  it('emits heartbeat comments on the configured interval', async () => {
    const out = collect(
      createNotificationStream({
        subscribe: noopSubscribe,
        getUnreadCount: async () => 0,
        signal: new AbortController().signal,
        heartbeatMs: 10,
      }),
    )

    await waitFor(() => out.text.includes(':hb\n\n'))
    expect(out.text).toContain(':hb\n\n')
  })

  it('unsubscribes and closes the stream on abort', async () => {
    const controller = new AbortController()
    let unsubscribed = false
    const out = collect(
      createNotificationStream({
        subscribe: () => () => {
          unsubscribed = true
        },
        getUnreadCount: async () => 0,
        signal: controller.signal,
        heartbeatMs: 10,
      }),
    )
    await waitFor(() => out.text.includes('data:'))

    controller.abort()

    await waitFor(() => out.done)
    expect(unsubscribed).toBe(true)
    expect(out.done).toBe(true)
  })

  it('reports count-query failures without killing the stream', async () => {
    const errors: unknown[] = []
    let fail = true
    let notify: () => void = () => {}
    const out = collect(
      createNotificationStream({
        subscribe: (onNotify) => {
          notify = onNotify
          return () => {}
        },
        getUnreadCount: async () => {
          if (fail) throw new Error('db down')
          return 7
        },
        signal: new AbortController().signal,
        onError: (err) => errors.push(err),
      }),
    )
    await waitFor(() => errors.length === 1)

    fail = false
    notify()

    await waitFor(() => out.text.includes('{"unread":7}'))
    expect(out.text).toContain('data: {"unread":7}\n\n')
    expect(errors).toHaveLength(1)
  })
})
