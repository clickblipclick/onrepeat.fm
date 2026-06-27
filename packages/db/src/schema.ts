import type { ColumnType, Generated } from 'kysely'

type Timestamp = ColumnType<Date, Date | string, Date | string>

/** Upstream account state mirrored from firehose #account events. Anything other
 *  than 'active' hides the actor's content at read time. */
export type ActorStatus =
  | 'active'
  | 'deactivated'
  | 'suspended'
  | 'takendown'
  | 'deleted'

export interface ActorsTable {
  did: string
  handle: string | null
  display_name: string | null
  avatar: string | null
  /** Freshness stamp for the bsky profile cache (handle/display_name/avatar). Null ⇒ stale. */
  profile_updated_at: Timestamp | null
  last_seen: Timestamp | null
  /** Chosen profile color-theme slug; null → deterministic default (see @onrepeat/core). */
  color_theme: string | null
  status: Generated<ActorStatus>
}

export interface ProviderRefs {
  [provider: string]: {
    url: string
    trackUri?: string
    videoId?: string
    songId?: string
    trackId?: string
    embeddable?: boolean
  }
}

export type ResolutionStatus =
  | 'pending'
  | 'resolved'
  | 'self_contained'
  | 'failed'

export interface TracksTable {
  id: string
  isrc: string | null
  title: string | null
  artist: string | null
  artwork_url: string | null
  /** Self-hosted (R2/CDN) copy of artwork_url; null until persisted. */
  cdn_artwork_url: string | null
  // jsonb: object on read, JSON string on write
  provider_refs: ColumnType<ProviderRefs, string | undefined, string>
  resolution_status: ColumnType<ResolutionStatus, string | undefined, string>
  resolved_at: Timestamp | null
}

export interface JamsTable {
  uri: string
  cid: string
  author_did: string
  track_id: string | null
  source_url: string
  source_provider: string | null
  raw_title: string | null
  raw_artist: string | null
  raw_artwork_url: string | null
  caption: string | null
  via_uri: string | null
  via_did: string | null
  created_at: Timestamp
  indexed_at: Generated<Timestamp>
}

export interface LikesTable {
  uri: string
  author_did: string
  subject_uri: string
  created_at: Timestamp
  indexed_at: Generated<Timestamp>
}

export interface SubscriptionStateTable {
  service: string
  // bigint: comes back as a string from pg, accepts number | string on write
  cursor: ColumnType<string, number | string, number | string>
  updated_at: Generated<Timestamp>
}

export interface OauthStateTable {
  key: string
  state: string // serialized NodeSavedState (JSON)
  created_at: Generated<Timestamp>
}

export interface OauthSessionTable {
  did: string
  session: string // serialized NodeSavedSession (JSON)
  updated_at: Generated<Timestamp>
}

export interface FailedEventsTable {
  id: Generated<string> // bigserial
  // bigint: comes back as a string from pg, accepts number | string on write
  seq: ColumnType<string, number | string, number | string>
  did: string
  collection: string
  action: string
  uri: string
  cid: string | null
  // jsonb: decoded record on read (null for deletes), JSON string on write
  record: ColumnType<unknown, string | null, string | null>
  error: string
  failed_at: Generated<Timestamp>
}

export interface Database {
  actors: ActorsTable
  tracks: TracksTable
  jams: JamsTable
  likes: LikesTable
  subscription_state: SubscriptionStateTable
  oauth_state: OauthStateTable
  oauth_session: OauthSessionTable
  failed_events: FailedEventsTable
}
