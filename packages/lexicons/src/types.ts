export interface StrongRef {
  uri: string
  cid: string
}

export interface JamRecord {
  $type: 'fm.onrepeat.feed.jam'
  sourceUrl: string
  sourceProvider: string
  title: string
  artist: string
  artworkUrl?: string
  caption?: string
  /** Attribution for a re-jam: a content-addressed strongRef to the source jam. */
  via?: StrongRef
  createdAt: string
}

export interface ProfileRecord {
  $type: 'fm.onrepeat.actor.profile'
  /** Slug of the chosen color theme; unknown values fall back to a default. */
  colorTheme?: string
  createdAt: string
}

export interface LikeRecord {
  $type: 'fm.onrepeat.feed.like'
  subject: StrongRef
  createdAt: string
}

export const JAM_NSID = 'fm.onrepeat.feed.jam'
export const LIKE_NSID = 'fm.onrepeat.feed.like'
export const PROFILE_NSID = 'fm.onrepeat.actor.profile'
