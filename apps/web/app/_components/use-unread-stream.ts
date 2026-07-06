'use client'

import { useEffect, useState } from 'react'

import { parseUnreadEvent, UNREAD_STREAM_PATH } from '@/lib/unread-stream'

/**
 * Live unread notification count: the server-rendered value until the SSE
 * stream reports a fresher one. The stream pushes a fresh count on connect and
 * whenever the count changes (new notification, or notifications marked seen —
 * in any tab), and EventSource auto-reconnects with a fresh count each time,
 * so gaps self-heal. Only mount when logged in — the stream 401s otherwise.
 */
export function useUnreadStream(serverUnread: number): number {
  const [live, setLive] = useState<number | null>(null)

  useEffect(() => {
    const source = new EventSource(UNREAD_STREAM_PATH)
    source.onmessage = (event) => {
      const unread = parseUnreadEvent(event.data)
      if (unread !== null) setLive(unread)
    }
    return () => source.close()
  }, [])

  return live ?? serverUnread
}
