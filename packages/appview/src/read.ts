import { sql, type SqlBool } from 'kysely'

import type { DB, ProviderRefs, ResolutionStatus } from '@onrepeat/db'

import type { ActorProfile } from './bsky'
import { decodeCursor, encodeCursor, type Cursor } from './cursor'

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

/**
 * Hide content authored by accounts that are not active upstream (deactivated,
 * suspended, taken down — mirrored from firehose #account events; deleted
 * accounts are purged outright at ingest). An author with no actors row counts
 * as active: the ingester upserts the row before any content lands.
 */
const authorActive = (
  col: 'jams.author_did' | 'likes.author_did',
): ReturnType<typeof sql<SqlBool>> =>
  sql<SqlBool>`not exists (select 1 from actors where actors.did = ${sql.ref(col)} and actors.status <> 'active')`

/** A cached profile row: the profile (or null for a negative-cache hit) and its freshness
 *  stamp (null ⇒ never hydrated / stale). */
export interface CachedActorProfile {
  profile: ActorProfile | null
  updatedAt: Date | null
}

/** Denormalized bsky profiles per DID from our own index (the write-through cache).
 *  Batched; empty-safe. Unknown DIDs are absent from the map. A row whose `handle` is null
 *  is a negative-cache hit (→ profile: null); `updatedAt` null means never hydrated. */
export async function loadActorProfiles(
  db: DB,
  dids: string[],
): Promise<Map<string, CachedActorProfile>> {
  const m = new Map<string, CachedActorProfile>()
  if (dids.length === 0) return m
  const rows = await db
    .selectFrom('actors')
    .select(['did', 'handle', 'display_name', 'avatar', 'profile_updated_at'])
    .where('did', 'in', dids)
    .execute()
  for (const r of rows) {
    const profile: ActorProfile | null = r.handle
      ? {
          did: r.did,
          handle: r.handle,
          displayName: r.display_name ?? undefined,
          avatar: r.avatar ?? undefined,
        }
      : null
    m.set(r.did, { profile, updatedAt: r.profile_updated_at })
  }
  return m
}

/** Stored color-theme slug per DID (null when unset). Batched; empty-safe. Unknown
 *  DIDs are simply absent from the map — callers resolve absent/null to a default. */
export async function loadActorThemes(
  db: DB,
  dids: string[],
): Promise<Map<string, string | null>> {
  const m = new Map<string, string | null>()
  if (dids.length === 0) return m
  const rows = await db
    .selectFrom('actors')
    .select(['did', 'color_theme'])
    .where('did', 'in', dids)
    .execute()
  for (const r of rows) m.set(r.did, r.color_theme)
  return m
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
    .where(authorActive('likes.author_did'))
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
      'tracks.cdn_artwork_url as track_cdn_artwork',
      'tracks.provider_refs as provider_refs',
      'tracks.resolution_status as resolution_status',
    ])
    .where('jams.uri', 'in', uris)
    .where(authorActive('jams.author_did'))
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
      artworkUrl:
        r.track_cdn_artwork ?? r.track_artwork ?? r.raw_artwork_url ?? null,
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
    .where(authorActive('jams.author_did'))
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
    .where(authorActive('jams.author_did'))
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
    .where(authorActive('likes.author_did'))
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
 * newest-first. One current jam per author via DISTINCT ON (inner), then ordered + keyset-
 * paginated + LIMITed in SQL (outer) so only one page of rows comes back, not every followed
 * author's jam. `followedDids` is supplied by the caller (from bsky).
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
  // Inner: one current jam per author. DISTINCT ON requires author_did first in ORDER BY,
  // which is why the newest-first feed ordering can't live here — it goes in the outer query.
  const current = db
    .selectFrom('jams')
    .distinctOn('author_did')
    .select(['uri', 'created_at'])
    .select(CURSOR_TS.as('cursor_ts'))
    .where('author_did', 'in', authorDids)
    .where(authorActive('jams.author_did'))
    .where('created_at', '<=', sql<Date>`${snap}::timestamptz`)
    .where(
      'created_at',
      '>',
      sql<Date>`${snap}::timestamptz - interval '7 days'`,
    )
    .orderBy('author_did')
    .orderBy('created_at', 'desc')
    .orderBy('uri', 'desc')
  // Outer: order the per-author set newest-first and apply the keyset cursor + LIMIT in SQL,
  // so the DB returns only one page instead of every followed author's current jam.
  let q = db
    .selectFrom(current.as('cur'))
    .select(['uri', 'cursor_ts'])
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
  return { jams, cursor: buildCursor(cursorItems, hasMore, snap) }
}
