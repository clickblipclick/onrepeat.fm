import type { DB } from '@onrepeat/db'
import type { ProviderRefs, ResolutionStatus } from '@onrepeat/db'
import { type Cursor, decodeCursor, encodeCursor } from './cursor'

export interface JamView {
  uri: string
  cid: string
  authorDid: string
  createdAt: string
  caption: string | null
  title: string
  artist: string
  artworkUrl: string | null
  sourceUrl: string
  sourceProvider: string | null
  providerRefs: ProviderRefs
  resolutionStatus: ResolutionStatus | null
  likeCount: number
  likedByYou: boolean
  via: { uri: string; did: string } | null
}

export interface Page {
  jams: JamView[]
  cursor?: string
}

interface PageParams {
  viewerDid?: string
  cursor?: string
  limit?: number
}

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

/** Like count + likedByYou for a set of jam uris (batched; empty-safe). */
async function loadLikeInfo(
  db: DB,
  uris: string[],
  viewerDid?: string,
): Promise<Map<string, { count: number; likedByYou: boolean }>> {
  const m = new Map<string, { count: number; likedByYou: boolean }>()
  if (uris.length === 0) return m
  for (const u of uris) m.set(u, { count: 0, likedByYou: false })
  const counts = await db
    .selectFrom('likes')
    .select('subject_uri')
    .select((eb) => eb.fn.count<string>('uri').as('count'))
    .where('subject_uri', 'in', uris)
    .groupBy('subject_uri')
    .execute()
  for (const c of counts) m.set(c.subject_uri, { count: Number(c.count), likedByYou: false })
  if (viewerDid) {
    const liked = await db
      .selectFrom('likes')
      .select('subject_uri')
      .where('subject_uri', 'in', uris)
      .where('author_did', '=', viewerDid)
      .execute()
    for (const l of liked) {
      const e = m.get(l.subject_uri)
      if (e) e.likedByYou = true
    }
  }
  return m
}

/** Load full JamViews for a set of uris (joined to tracks + likes), preserving the given order. */
export async function loadJamsByUris(db: DB, uris: string[], viewerDid?: string): Promise<JamView[]> {
  if (uris.length === 0) return []
  const rows = await db
    .selectFrom('jams')
    .leftJoin('tracks', 'tracks.id', 'jams.track_id')
    .select([
      'jams.uri', 'jams.cid', 'jams.author_did', 'jams.created_at', 'jams.caption',
      'jams.source_url', 'jams.source_provider', 'jams.raw_title', 'jams.raw_artist',
      'jams.via_uri', 'jams.via_did',
      'tracks.title as track_title', 'tracks.artist as track_artist', 'tracks.artwork_url as track_artwork',
      'tracks.provider_refs as provider_refs', 'tracks.resolution_status as resolution_status',
    ])
    .where('jams.uri', 'in', uris)
    .execute()
  const likeInfo = await loadLikeInfo(db, uris, viewerDid)
  const byUri = new Map<string, JamView>()
  for (const r of rows) {
    const li = likeInfo.get(r.uri) ?? { count: 0, likedByYou: false }
    byUri.set(r.uri, {
      uri: r.uri,
      cid: r.cid,
      authorDid: r.author_did,
      createdAt: new Date(r.created_at as unknown as string | Date).toISOString(),
      caption: r.caption,
      title: r.track_title ?? r.raw_title ?? '',
      artist: r.track_artist ?? r.raw_artist ?? '',
      artworkUrl: r.track_artwork ?? null,
      sourceUrl: r.source_url,
      sourceProvider: r.source_provider,
      providerRefs: (r.provider_refs as ProviderRefs | null) ?? {},
      resolutionStatus: (r.resolution_status as ResolutionStatus | null) ?? null,
      likeCount: li.count,
      likedByYou: li.likedByYou,
      via: r.via_uri && r.via_did ? { uri: r.via_uri, did: r.via_did } : null,
    })
  }
  // preserve input order, drop any uri that had no row
  return uris.map((u) => byUri.get(u)).filter((v): v is JamView => v !== undefined)
}

/** Build the next-page cursor from the last item, if there are more rows. */
function buildCursor(items: { createdAt: string; uri: string }[], hasMore: boolean): string | undefined {
  if (!hasMore || items.length === 0) return undefined
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const last = items[items.length - 1]!
  return encodeCursor({ createdAt: last.createdAt, uri: last.uri })
}

/** Explore/Latest — network-wide recent jams, newest-first. */
export async function getLatest(db: DB, params: PageParams = {}): Promise<Page> {
  const limit = clampLimit(params.limit)
  const cur: Cursor | undefined = params.cursor ? decodeCursor(params.cursor) : undefined
  let q = db
    .selectFrom('jams')
    .select(['uri', 'created_at'])
    .orderBy('created_at', 'desc')
    .orderBy('uri', 'desc')
    .limit(limit + 1)
  if (cur) {
    const cursorDate = new Date(cur.createdAt)
    q = q.where((eb) =>
      eb.or([
        eb('created_at', '<', cursorDate),
        eb.and([eb('created_at', '=', cursorDate), eb('uri', '<', cur.uri)]),
      ]),
    )
  }
  const idRows = await q.execute()
  const hasMore = idRows.length > limit
  const pageRows = idRows.slice(0, limit)
  const jams = await loadJamsByUris(db, pageRows.map((r) => r.uri), params.viewerDid)
  const cursorItems = pageRows.map((r) => ({
    createdAt: new Date(r.created_at as unknown as string | Date).toISOString(),
    uri: r.uri,
  }))
  return { jams, cursor: buildCursor(cursorItems, hasMore) }
}
