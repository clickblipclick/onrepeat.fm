export interface NotificationStreamOptions {
  /** Register for change pings (pre-bound to the viewer's did); returns unsubscribe. */
  subscribe: (onNotify: () => void) => () => void
  getUnreadCount: () => Promise<number>
  /** Request abort signal — closes the stream and releases the subscription. */
  signal: AbortSignal
  heartbeatMs?: number
  onError?: (err: unknown) => void
}

/**
 * SSE body for the notification stream: one `data: {"unread":N}` event on
 * connect (so a reconnect self-heals — pings missed while disconnected are
 * reflected in the fresh count), another whenever a notification ping fires,
 * and `:hb` comments to keep intermediary proxies from reaping the idle
 * connection. Pings are edge triggers, not payloads: each one re-queries the
 * count, and a burst that arrives mid-query collapses into a single trailing
 * refresh rather than a query per ping.
 */
export function createNotificationStream(
  options: NotificationStreamOptions,
): ReadableStream<Uint8Array> {
  const heartbeatMs = options.heartbeatMs ?? 25_000
  const onError =
    options.onError ??
    ((err: unknown) => console.error('[notification-stream]', err))
  const encoder = new TextEncoder()

  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let closed = false
  let refreshing = false
  let dirty = false

  const release = () => {
    closed = true
    unsubscribe?.()
    unsubscribe = null
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = null
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        if (closed) return
        controller.enqueue(encoder.encode(text))
      }

      const refresh = async () => {
        if (refreshing) return
        refreshing = true
        while (dirty && !closed) {
          dirty = false
          try {
            const unread = await options.getUnreadCount()
            send(`data: ${JSON.stringify({ unread })}\n\n`)
          } catch (err) {
            onError(err)
          }
        }
        refreshing = false
      }

      const scheduleRefresh = () => {
        dirty = true
        void refresh()
      }

      const close = () => {
        if (closed) return
        release()
        try {
          controller.close()
        } catch {
          // reader already errored/cancelled; resources are released above
        }
      }

      if (options.signal.aborted) {
        close()
        return
      }
      options.signal.addEventListener('abort', close, { once: true })
      unsubscribe = options.subscribe(scheduleRefresh)
      heartbeat = setInterval(() => send(':hb\n\n'), heartbeatMs)
      scheduleRefresh()
    },
    cancel() {
      // Reader torn down without an abort (e.g. client socket vanished).
      release()
    },
  })
}
