export interface ViaRef {
  uri: string
  did: string
}

export interface JamRecord {
  $type?: 'fm.onrepeat.jam'
  sourceUrl: string
  sourceProvider: string
  title: string
  artist: string
  artworkUrl?: string
  isrc?: string
  caption?: string
  via?: ViaRef
  createdAt: string
}

export interface StrongRef {
  uri: string
  cid: string
}

export interface LikeRecord {
  $type?: 'fm.onrepeat.like'
  subject: StrongRef
  createdAt: string
}

export const JAM_NSID = 'fm.onrepeat.jam'
export const LIKE_NSID = 'fm.onrepeat.like'
