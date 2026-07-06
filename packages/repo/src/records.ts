import {
  FOLLOW_NSID,
  JAM_NSID,
  LIKE_NSID,
  PROFILE_NSID,
  validateRecord,
  type FollowRecord,
  type JamRecord,
  type LikeRecord,
  type ProfileRecord,
  type StrongRef,
} from '@onrepeat/lexicons'

/** A built record failed local lexicon validation — thrown before any network
 *  write, unlike RepoWriteError which covers the write itself. */
export class RecordValidationError extends Error {
  constructor(
    readonly nsid: string,
    readonly detail: string,
  ) {
    // Last NSID segment keeps the message human ("invalid jam: …").
    super(`invalid ${nsid.split('.').pop()}: ${detail}`)
    this.name = 'RecordValidationError'
  }
}

/** Validate against the lexicon and return the canonicalized value — write
 *  that, not the input, in case validation normalizes shapes (e.g. blob refs). */
function validated<T>(nsid: string, record: T): T {
  const result = validateRecord(nsid, record)
  if (!result.success) throw new RecordValidationError(nsid, result.error)
  return result.value as T
}

export interface JamInput {
  sourceUrl: string
  sourceProvider: string
  title: string
  artist: string
  artworkUrl?: string
  caption?: string
  via?: StrongRef
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

  return validated(JAM_NSID, record)
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
  return validated(LIKE_NSID, record)
}

export function buildFollowRecord(
  subject: string,
  createdAt?: string,
): FollowRecord {
  const record: FollowRecord = {
    $type: FOLLOW_NSID,
    subject,
    createdAt: createdAt ?? new Date().toISOString(),
  }
  return validated(FOLLOW_NSID, record)
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

  return validated(PROFILE_NSID, record)
}
