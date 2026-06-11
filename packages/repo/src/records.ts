import {
  validateRecord,
  JAM_NSID,
  LIKE_NSID,
  PROFILE_NSID,
  type JamRecord,
  type LikeRecord,
  type ProfileRecord,
  type StrongRef,
} from '@onrepeat/lexicons'

export interface JamInput {
  sourceUrl: string
  sourceProvider: string
  title: string
  artist: string
  artworkUrl?: string
  caption?: string
  via?: { uri: string; did: string }
  /** Defaults to now() if omitted. */
  createdAt?: string
}

export function buildJamRecord(input: JamInput): JamRecord {
  const record: JamRecord = {
    $type: JAM_NSID,
    sourceUrl: input.sourceUrl,
    sourceProvider: input.sourceProvider,
    title: input.title,
    artist: input.artist,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
  if (input.artworkUrl) record.artworkUrl = input.artworkUrl
  if (input.caption) record.caption = input.caption
  if (input.via) record.via = input.via

  const result = validateRecord(JAM_NSID, record)
  if (!result.success) throw new Error(`invalid jam: ${result.error}`)
  return record
}

export function buildLikeRecord(
  subject: StrongRef,
  createdAt?: string,
): LikeRecord {
  const record: LikeRecord = {
    $type: LIKE_NSID,
    subject,
    createdAt: createdAt ?? new Date().toISOString(),
  }
  const result = validateRecord(LIKE_NSID, record)
  if (!result.success) throw new Error(`invalid like: ${result.error}`)
  return record
}

export function buildProfileRecord(input: {
  colorTheme?: string
  createdAt?: string
}): ProfileRecord {
  const record: ProfileRecord = {
    $type: PROFILE_NSID,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
  if (input.colorTheme) record.colorTheme = input.colorTheme

  const result = validateRecord(PROFILE_NSID, record)
  if (!result.success) throw new Error(`invalid profile: ${result.error}`)
  return record
}
