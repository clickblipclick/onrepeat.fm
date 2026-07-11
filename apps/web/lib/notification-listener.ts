import {
  createNotificationListener,
  type NotificationListener,
} from '@onrepeat/db'

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL must be set')
  return url
}

// Shared LISTEN connection for SSE fan-out — one Postgres connection per process
// no matter how many streams are open. Singleton across dev hot reloads, same
// pattern as lib/db.ts.
const globalForListener = globalThis as unknown as {
  __onrepeatNotificationListener?: Promise<NotificationListener>
}

let cached: Promise<NotificationListener> | undefined =
  globalForListener.__onrepeatNotificationListener

export function getNotificationListener(): Promise<NotificationListener> {
  if (!cached) {
    const created = createNotificationListener(requireDatabaseUrl())
    cached = created
    if (process.env.NODE_ENV !== 'production')
      globalForListener.__onrepeatNotificationListener = created
    // A rejected promise must not be cached forever — clear it so the next
    // request retries the initial connect.
    created.catch(() => {
      if (cached === created) cached = undefined
      if (globalForListener.__onrepeatNotificationListener === created)
        globalForListener.__onrepeatNotificationListener = undefined
    })
  }
  return cached
}
