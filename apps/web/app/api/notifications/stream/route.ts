import { NextResponse } from 'next/server'

import { getUnreadNotificationCount } from '@onrepeat/appview'

import { db } from '@/lib/db'
import { getNotificationListener } from '@/lib/notification-listener'
import { createNotificationStream } from '@/lib/notification-stream'
import { getSession } from '@/lib/session'

/**
 * SSE stream of the viewer's unread notification count: one event on connect,
 * one whenever a notification lands (via the Postgres NOTIFY trigger). The
 * browser's EventSource reconnects on drops, and each (re)connect pushes a
 * fresh count, so missed events self-heal.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session.did)
    return NextResponse.json({ error: 'login required' }, { status: 401 })
  const did = session.did

  let listener
  try {
    listener = await getNotificationListener()
  } catch (err) {
    console.error(
      '[web] /api/notifications/stream listener connect failed',
      err,
    )
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }

  const stream = createNotificationStream({
    subscribe: (onNotify) => listener.subscribe(did, onNotify),
    getUnreadCount: () => getUnreadNotificationCount(db, did),
    signal: req.signal,
    onError: (err) =>
      console.error('[web] /api/notifications/stream count query failed', err),
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      // Defensive: some reverse proxies buffer streaming responses otherwise.
      'x-accel-buffering': 'no',
    },
  })
}
