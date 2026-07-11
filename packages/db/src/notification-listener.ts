import pg from 'pg'

/** Channel the 015_notification_notify trigger broadcasts on; payload is the recipient did. */
export const NOTIFICATIONS_CHANNEL = 'notifications'

export interface NotificationListener {
  /** Register a callback for new notifications addressed to `did`. Returns an unsubscribe fn. */
  subscribe(did: string, onNotify: () => void): () => void
  close(): Promise<void>
}

export interface NotificationListenerOptions {
  /** Delay before re-connecting after the LISTEN connection drops. */
  reconnectDelayMs?: number
  onError?: (err: unknown) => void
}

/**
 * One dedicated LISTEN connection fanning out to in-process subscribers keyed by
 * recipient did — one Postgres connection per process regardless of subscriber
 * count. Notifications raised while the connection is down are lost (NOTIFY has
 * no replay); subscribers that need gapless state must re-query after gaps, so
 * treat a delivery as "something changed", not as the change itself.
 */
export async function createNotificationListener(
  connectionString: string,
  options: NotificationListenerOptions = {},
): Promise<NotificationListener> {
  const reconnectDelayMs = options.reconnectDelayMs ?? 1000
  const onError =
    options.onError ??
    ((err: unknown) => console.error('[notification-listener]', err))

  const subscribers = new Map<string, Set<() => void>>()
  let client: pg.Client | null = null
  let reconnectTimer: NodeJS.Timeout | null = null
  let closed = false

  const handleNotification = (msg: pg.Notification) => {
    if (msg.channel !== NOTIFICATIONS_CHANNEL || !msg.payload) return
    const subs = subscribers.get(msg.payload)
    if (!subs) return
    for (const fn of [...subs]) {
      try {
        fn()
      } catch (err) {
        onError(err)
      }
    }
  }

  const connect = async (): Promise<void> => {
    const next = new pg.Client({ connectionString })
    next.on('notification', handleNotification)
    // node-postgres requires an 'error' listener or a dropped connection
    // crashes the process; 'end' fires afterwards and drives the reconnect.
    next.on('error', onError)
    next.on('end', () => {
      if (client === next) {
        client = null
        scheduleReconnect()
      }
    })
    await next.connect()
    await next.query(`LISTEN ${NOTIFICATIONS_CHANNEL}`)
    client = next
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect().catch((err) => {
        onError(err)
        scheduleReconnect()
      })
    }, reconnectDelayMs)
  }

  await connect()

  return {
    subscribe(did, onNotify) {
      let set = subscribers.get(did)
      if (!set) {
        set = new Set()
        subscribers.set(did, set)
      }
      set.add(onNotify)
      return () => {
        set.delete(onNotify)
        if (set.size === 0) subscribers.delete(did)
      }
    },
    async close() {
      closed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      const current = client
      client = null
      if (current) await current.end().catch(onError)
    },
  }
}
