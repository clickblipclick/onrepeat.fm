import type { DB } from '@onrepeat/db'
import type { ProviderRefs, ResolutionStatus } from '@onrepeat/db'
import { sql } from 'kysely'
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

// Render created_at to a full-microsecond ISO string for the cursor. node-postgres maps
// timestamptz to a millisecond-precision JS Date, so building the cursor from the read-back
// Date would lose microseconds — and the keyset boundary (which compares against the raw
// timestamptz column) would then skip/duplicate rows that share a millisecond but differ in
// microseconds. Formatting in SQL keeps the cursor exact, so it round-trips losslessly via
// `::timestamptz` in the boundary below.
const CURSOR_TS = sql<string>`to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

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
  for (const c of counts)
    m.set(c.subject_uri, { count: Number(c.count), likedByYou: false })
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
export async function loadJamsByUris(
  db: DB,
  uris: string[],
  viewerDid?: string,
): Promise<JamView[]> {
  if (uris.length === 0) return []
  const rows = await db
    .selectFrom('jams')
    .leftJoin('tracks', 'tracks.id', 'jams.track_id')
    .select([
      'jams.uri',
      'jams.cid',
      'jams.author_did',
      'jams.created_at',
      'jams.caption',
      'jams.source_url',
      'jams.source_provider',
      'jams.raw_title',
      'jams.raw_artist',
      'jams.raw_artwork_url',
      'jams.via_uri',
      'jams.via_did',
      'tracks.title as track_title',
      'tracks.artist as track_artist',
      'tracks.artwork_url as track_artwork',
      'tracks.provider_refs as provider_refs',
      'tracks.resolution_status as resolution_status',
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
      createdAt: new Date(
        r.created_at as unknown as string | Date,
      ).toISOString(),
      caption: r.caption,
      title: r.track_title ?? r.raw_title ?? '',
      artist: r.track_artist ?? r.raw_artist ?? '',
      artworkUrl: r.track_artwork ?? r.raw_artwork_url ?? null,
      sourceUrl: r.source_url,
      sourceProvider: r.source_provider,
      providerRefs: (r.provider_refs as ProviderRefs | null) ?? {},
      resolutionStatus:
        (r.resolution_status as ResolutionStatus | null) ?? null,
      likeCount: li.count,
      likedByYou: li.likedByYou,
      via: r.via_uri && r.via_did ? { uri: r.via_uri, did: r.via_did } : null,
    })
  }
  // preserve input order, drop any uri that had no row
  return uris
    .map((u) => byUri.get(u))
    .filter((v): v is JamView => v !== undefined)
}

/** Build the next-page cursor from the last item, if there are more rows. `snap` pins a
 *  feed's time window across pages (follow feed); omitted for the keyset feeds. */
function buildCursor(
  items: { createdAt: string; uri: string }[],
  hasMore: boolean,
  snap?: string,
): string | undefined {
  if (!hasMore || items.length === 0) return undefined
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const last = items[items.length - 1]!
  return encodeCursor({ createdAt: last.createdAt, uri: last.uri, snap })
}

/** Explore/Latest — network-wide recent jams, newest-first. */
export async function getLatest(
  db: DB,
  params: PageParams = {},
): Promise<Page> {
  const limit = clampLimit(params.limit)
  const cur: Cursor | undefined = params.cursor
    ? decodeCursor(params.cursor)
    : undefined
  let q = db
    .selectFrom('jams')
    .select('uri')
    .select(CURSOR_TS.as('cursor_ts'))
    .orderBy('created_at', 'desc')
    .orderBy('uri', 'desc')
    .limit(limit + 1)
  if (cur) {
    const cursorDate = sql<Date>`${cur.createdAt}::timestamptz`
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
  const jams = await loadJamsByUris(
    db,
    pageRows.map((r) => r.uri),
    params.viewerDid,
  )
  const cursorItems = pageRows.map((r) => ({
    createdAt: r.cursor_ts,
    uri: r.uri,
  }))
  return { jams, cursor: buildCursor(cursorItems, hasMore) }
}

/** A profile's jams, newest-first (jams[0] is the current jam if <7 days old). */
export async function getActorJams(
  db: DB,
  params: PageParams & { did: string },
): Promise<Page> {
  const limit = clampLimit(params.limit)
  const cur = params.cursor ? decodeCursor(params.cursor) : undefined
  let q = db
    .selectFrom('jams')
    .select('uri')
    .select(CURSOR_TS.as('cursor_ts'))
    .where('author_did', '=', params.did)
    .orderBy('created_at', 'desc')
    .orderBy('uri', 'desc')
    .limit(limit + 1)
  if (cur) {
    const cursorDate = sql<Date>`${cur.createdAt}::timestamptz`
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
  const jams = await loadJamsByUris(
    db,
    pageRows.map((r) => r.uri),
    params.viewerDid,
  )
  const cursorItems = pageRows.map((r) => ({
    createdAt: r.cursor_ts,
    uri: r.uri,
  }))
  return { jams, cursor: buildCursor(cursorItems, hasMore) }
}

export interface JamDetail {
  jam: JamView
  likerDids: string[]
  reJams: JamView[]
}

const JAM_LIKERS_LIMIT = 50
const JAM_REJAMS_LIMIT = 50

/** A single jam + its likers (DIDs) + the re-jams that adopted it, newest-first. Null if not found. */
export async function getJam(
  db: DB,
  params: {
    uri: string
    viewerDid?: string
    likersLimit?: number
    reJamsLimit?: number
  },
): Promise<JamDetail | null> {
  const [jam] = await loadJamsByUris(db, [params.uri], params.viewerDid)
  if (!jam) return null
  const likersLimit = params.likersLimit ?? JAM_LIKERS_LIMIT
  const reJamsLimit = params.reJamsLimit ?? JAM_REJAMS_LIMIT
  // Bounded: the true total is jam.likeCount (from loadLikeInfo); here we hydrate at most
  // `likersLimit` liker DIDs (most recent first) so a viral jam can't fan out into an
  // unbounded sequence of getProfiles calls. Same cap on re-jams.
  const likers = await db
    .selectFrom('likes')
    .select('author_did')
    .where('subject_uri', '=', params.uri)
    .orderBy('created_at', 'desc')
    .orderBy('uri', 'desc')
    .limit(likersLimit)
    .execute()
  const reJamRows = await db
    .selectFrom('jams')
    .select('uri')
    .where('via_uri', '=', params.uri)
    .orderBy('created_at', 'desc')
    .orderBy('uri', 'desc')
    .limit(reJamsLimit)
    .execute()
  const reJams = await loadJamsByUris(
    db,
    reJamRows.map((r) => r.uri),
    params.viewerDid,
  )
  return { jam, likerDids: likers.map((l) => l.author_did), reJams }
}

/**
 * Follow-feed: the current jam (latest <7 days) of each followed DID — plus the viewer's
 * own current jam (home feeds conventionally include your own posts without a self-follow) —
 * newest-first. One current jam per author via DISTINCT ON, then ordered/paginated in memory
 * (bounded by the follow count). `followedDids` is supplied by the caller (from bsky).
 */
export async function getFollowFeed(
  db: DB,
  params: PageParams & { followedDids: string[] },
): Promise<Page> {
  const limit = clampLimit(params.limit)
  // Home feeds conventionally include your own jam without a self-follow — fold the
  // viewer into the author set (deduped; you can't follow yourself on bsky anyway).
  const authorDids = params.viewerDid
    ? Array.from(new Set([...params.followedDids, params.viewerDid]))
    : params.followedDids
  if (authorDids.length === 0) return { jams: [] }
  const cur = params.cursor ? decodeCursor(params.cursor) : undefined
  // Pin the 7-day window to a snapshot taken on the first page and carried in the cursor, so
  // every page sees the SAME window (`> snap-7d` and `<= snap`) instead of a moving now().
  // Otherwise an author's "current jam" could expire or be replaced by a newer post between
  // pages, shifting the ordering and silently dropping/duplicating authors at boundaries.
  const snap = cur?.snap ?? new Date().toISOString()
  // MVP: DISTINCT ON yields one current jam per author (≤ ~10k follows typical),
  // sorted + paginated in memory. If follows scale to 50k+, push ORDER BY + LIMIT into SQL.
  const currentRows = await db
    .selectFrom('jams')
    .distinctOn('author_did')
    .select('uri')
    .select(CURSOR_TS.as('cursor_ts'))
    .where('author_did', 'in', authorDids)
    .where('created_at', '<=', sql<Date>`${snap}::timestamptz`)
    .where(
      'created_at',
      '>',
      sql<Date>`${snap}::timestamptz - interval '7 days'`,
    )
    .orderBy('author_did')
    .orderBy('created_at', 'desc')
    .orderBy('uri', 'desc')
    .execute()
  // newest-first across authors, then cursor + limit (in memory; set is <= #follows).
  // cursor_ts is a microsecond ISO string, so lexicographic compare == chronological.
  const sorted = currentRows
    .map((r) => ({
      uri: r.uri,
      createdAt: r.cursor_ts,
    }))
    .sort((a, b) =>
      a.createdAt < b.createdAt
        ? 1
        : a.createdAt > b.createdAt
          ? -1
          : a.uri < b.uri
            ? 1
            : -1,
    )
  const afterCursor = cur
    ? sorted.filter(
        (r) =>
          r.createdAt < cur.createdAt ||
          (r.createdAt === cur.createdAt && r.uri < cur.uri),
      )
    : sorted
  const pageIds = afterCursor.slice(0, limit)
  const hasMore = afterCursor.length > limit
  const jams = await loadJamsByUris(
    db,
    pageIds.map((r) => r.uri),
    params.viewerDid,
  )
  return { jams, cursor: buildCursor(pageIds, hasMore, snap) }
}
