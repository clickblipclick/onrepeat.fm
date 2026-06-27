import type { DB } from '@onrepeat/db'
import { persistArtwork, type ArtworkStore } from '@onrepeat/storage'

interface BackfillArtworkOpts {
  /** Override the persist fn (tests inject a stub); defaults to persistArtwork bound to `store`. */
  persist?: (artworkUrl: string) => Promise<string | null>
}

/**
 * One-off: copy each track's provider art to our CDN where it isn't already persisted.
 * Walks `tracks` with a provider `artwork_url` but no `cdn_artwork_url`, persists each
 * (idempotent / content-addressed), and records the CDN URL. Returns the count updated.
 */
export async function backfillArtwork(
  db: DB,
  store: ArtworkStore,
  opts: BackfillArtworkOpts = {},
): Promise<number> {
  const persist = opts.persist ?? ((u: string) => persistArtwork(u, store))
  const rows = await db
    .selectFrom('tracks')
    .select(['id', 'artwork_url'])
    .where('cdn_artwork_url', 'is', null)
    .where('artwork_url', 'is not', null)
    .execute()
  let n = 0
  for (const row of rows) {
    if (!row.artwork_url) continue
    const cdn = await persist(row.artwork_url)
    if (!cdn) continue
    await db
      .updateTable('tracks')
      .set({ cdn_artwork_url: cdn })
      .where('id', '=', row.id)
      .execute()
    n++
  }
  return n
}
