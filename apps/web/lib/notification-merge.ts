/**
 * Merge a freshly fetched first page into the notifications the viewer already
 * has: new items prepend (the feed is newest-first), items already in the list
 * keep their existing entry so client-side state (e.g. "new" dots) survives,
 * and a no-op merge returns the same array so React skips the re-render.
 */
export function mergeNotifications<T extends { recordUri: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const have = new Set(existing.map((n) => n.recordUri))
  const fresh = incoming.filter((n) => !have.has(n.recordUri))
  return fresh.length ? [...fresh, ...existing] : existing
}

/**
 * Buffer a freshly fetched first page behind the "show N new notifications"
 * button: anything already shown or already buffered is dropped, genuinely new
 * items prepend to the buffer (newest-first), and a no-op returns the same
 * array so React skips the re-render.
 */
export function mergeIntoPending<T extends { recordUri: string }>(
  shown: T[],
  pending: T[],
  incoming: T[],
): T[] {
  const have = new Set([...shown, ...pending].map((n) => n.recordUri))
  const fresh = incoming.filter((n) => !have.has(n.recordUri))
  return fresh.length ? [...fresh, ...pending] : pending
}
