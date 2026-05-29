import type { ColumnType, Generated } from 'kysely'

type Timestamp = ColumnType<Date, Date | string, Date | string>

export interface ActorsTable {
  did: string
  handle: string | null
  display_name: string | null
  avatar: string | null
  last_seen: Timestamp | null
}

export interface ProviderRefs {
  [provider: string]: { url: string; trackUri?: string; videoId?: string; songId?: string; trackId?: string }
}

export type ResolutionStatus = 'pending' | 'resolved' | 'self_contained' | 'failed'

export interface TracksTable {
  id: string
  isrc: string | null
  title: string | null
  artist: string | null
  artwork_url: string | null
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

export interface Database {
  actors: ActorsTable
  tracks: TracksTable
  jams: JamsTable
  likes: LikesTable
}
