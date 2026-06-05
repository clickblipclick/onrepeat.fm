export interface Cursor {
  createdAt: string // ISO timestamp of the last item
  uri: string // at-uri of the last item (tiebreaker)
}

/** Opaque base64url cursor over (created_at, uri). */
export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.createdAt}|${c.uri}`, 'utf8').toString('base64url')
}

export function decodeCursor(s: string): Cursor {
  const decoded = Buffer.from(s, 'base64url').toString('utf8')
  const sep = decoded.indexOf('|')
  if (sep === -1) throw new Error('invalid cursor')
  const createdAt = decoded.slice(0, sep)
  const uri = decoded.slice(sep + 1)
  if (!createdAt || !uri || !uri.startsWith('at://'))
    throw new Error('invalid cursor')
  return { createdAt, uri }
}
