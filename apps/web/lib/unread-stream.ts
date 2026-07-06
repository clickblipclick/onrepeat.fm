/** Path the badge's EventSource connects to (see app/api/notifications/stream). */
export const UNREAD_STREAM_PATH = '/api/notifications/stream'

/**
 * Parse one SSE `data:` payload from the unread stream into a count, or null
 * if it isn't a well-formed `{"unread": <non-negative integer>}` event.
 */
export function parseUnreadEvent(data: string): number | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const unread = (parsed as { unread?: unknown }).unread
  if (typeof unread !== 'number' || !Number.isInteger(unread) || unread < 0)
    return null
  return unread
}
