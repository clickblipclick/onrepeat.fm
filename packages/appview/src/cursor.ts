export interface Cursor {
  createdAt: string // ISO timestamp of the last item
  uri: string // at-uri of the last item (tiebreaker)
  /** Optional snapshot timestamp pinning a feed's time window across pages (follow feed). */
  snap?: string
}

/** Opaque base64url cursor over (snap, created_at, uri). `uri` is last because it can itself
 *  contain '|'; `snap`/`createdAt` are timestamps (or empty) and never do. */
export function encodeCursor(c: Cursor): string {
  return Buffer.from(
    `${c.snap ?? ''}|${c.createdAt}|${c.uri}`,
    'utf8',
  ).toString('base64url')
}

// Both timestamp slots are interpolated into `::timestamptz` casts downstream; reject
// anything that isn't a plain ISO-8601 UTC instant here so a hand-crafted cursor fails
// as `invalid cursor` at the boundary instead of a Postgres syntax error mid-query.
// Fractional seconds are optional: JS toISOString emits 3 digits (snap), the SQL cursor
// formatter emits 6 (createdAt).
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/

export function decodeCursor(s: string): Cursor {
  const decoded = Buffer.from(s, 'base64url').toString('utf8')
  const i1 = decoded.indexOf('|')
  const i2 = i1 === -1 ? -1 : decoded.indexOf('|', i1 + 1)
  if (i1 === -1 || i2 === -1) throw new Error('invalid cursor')
  const snap = decoded.slice(0, i1)
  const createdAt = decoded.slice(i1 + 1, i2)
  const uri = decoded.slice(i2 + 1)
  if (!ISO_UTC.test(createdAt) || !uri.startsWith('at://'))
    throw new Error('invalid cursor')
  if (snap && !ISO_UTC.test(snap)) throw new Error('invalid cursor')
  return { createdAt, uri, snap: snap || undefined }
}
