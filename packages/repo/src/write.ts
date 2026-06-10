import type { Agent } from '@atproto/api'
import {
  JAM_NSID,
  LIKE_NSID,
  PROFILE_NSID,
  type StrongRef,
  type JamRecord,
} from '@onrepeat/lexicons'
import {
  buildJamRecord,
  buildLikeRecord,
  buildProfileRecord,
  type JamInput,
} from './records'

/** Why a repo write failed, so callers can react (re-auth vs back off vs surface). */
export type WriteErrorKind =
  | 'auth' // expired/invalid session (401/403) — re-login
  | 'rate-limit' // 429 — back off and retry later
  | 'conflict' // optimistic-concurrency swap failure (409)
  | 'transient' // 5xx or network/timeout — safe to retry
  | 'unknown' // anything else (e.g. 4xx bad request)

/** Normalized error for all repo writes; wraps the underlying XRPC/network error. */
export class RepoWriteError extends Error {
  constructor(
    readonly kind: WriteErrorKind,
    readonly status: number | undefined,
    readonly cause: unknown,
  ) {
    super(
      `repo write failed (${kind}${status !== undefined ? ` ${status}` : ''})`,
    )
    this.name = 'RepoWriteError'
  }
}

function classifyWriteError(err: unknown): RepoWriteError {
  const status =
    typeof (err as { status?: unknown })?.status === 'number'
      ? (err as { status: number }).status
      : undefined
  const errorName =
    typeof (err as { error?: unknown })?.error === 'string'
      ? (err as { error: string }).error
      : undefined
  let kind: WriteErrorKind
  if (status === 401 || status === 403) kind = 'auth'
  else if (status === 429) kind = 'rate-limit'
  // Swap failures arrive as HTTP 400 with error name 'InvalidSwap', not 409.
  else if (status === 409 || errorName === 'InvalidSwap') kind = 'conflict'
  // @atproto/xrpc wraps fetch/network failures in an XRPCError with synthetic
  // status ResponseType.Unknown (1) — and malformed responses as
  // ResponseType.InvalidResponse (2) — rather than rethrowing, so a real network
  // error never reaches us with status === undefined. Both are retryable.
  else if (
    status === undefined ||
    status === 1 ||
    status === 2 ||
    status >= 500
  )
    kind = 'transient'
  else kind = 'unknown'
  return new RepoWriteError(kind, status, err)
}

/** Run a write, normalizing any failure into a RepoWriteError. */
async function tryWrite<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw classifyWriteError(err)
  }
}

export interface WriteResult {
  uri: string
  cid: string
  /**
   * Server-side lexicon validation outcome. The PDS doesn't know fm.onrepeat.* lexicons,
   * so this is 'unknown' (validation is enforced locally in buildXRecord); surfaced for
   * observability. See https://atproto.com/specs/repository.
   */
  validationStatus?: 'valid' | 'unknown'
}

export interface PostJamResult extends WriteResult {
  /** The record that was written (incl. the resolved createdAt). */
  record: JamRecord
}

/** Write the user's current jam (a new append-only record) to their repo. */
export async function postJam(
  agent: Agent,
  input: JamInput,
): Promise<PostJamResult> {
  const record = buildJamRecord(input)
  const res = await tryWrite(() =>
    agent.com.atproto.repo.createRecord({
      repo: agent.assertDid,
      collection: JAM_NSID,
      record: record as unknown as Record<string, unknown>,
    }),
  )
  return {
    uri: res.data.uri,
    cid: res.data.cid,
    validationStatus: res.data.validationStatus as
      | 'valid'
      | 'unknown'
      | undefined,
    record,
  }
}

/** Like a jam by writing a like record referencing its strongRef. */
export async function likeJam(
  agent: Agent,
  subject: StrongRef,
): Promise<WriteResult> {
  const record = buildLikeRecord(subject)
  const res = await tryWrite(() =>
    agent.com.atproto.repo.createRecord({
      repo: agent.assertDid,
      collection: LIKE_NSID,
      record: record as unknown as Record<string, unknown>,
    }),
  )
  return {
    uri: res.data.uri,
    cid: res.data.cid,
    validationStatus: res.data.validationStatus as
      | 'valid'
      | 'unknown'
      | undefined,
  }
}

/**
 * Upsert the user's onrepeat profile (single `self` record) with their chosen theme.
 * Uses putRecord (not createRecord) so a theme change overwrites in place; last-write-wins
 * across devices (no swap CID), which is fine for a personal preference.
 */
export async function putProfile(
  agent: Agent,
  input: { colorTheme?: string },
): Promise<WriteResult> {
  const record = buildProfileRecord(input)
  const res = await tryWrite(() =>
    agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: PROFILE_NSID,
      rkey: 'self',
      record: record as unknown as Record<string, unknown>,
    }),
  )
  return {
    uri: res.data.uri,
    cid: res.data.cid,
    validationStatus: res.data.validationStatus as
      | 'valid'
      | 'unknown'
      | undefined,
  }
}

/** Un-like by deleting the like record (rkey must be known by the caller). */
export async function unlikeJam(agent: Agent, rkey: string): Promise<void> {
  await tryWrite(() =>
    agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: LIKE_NSID,
      rkey,
    }),
  )
}

/** Delete one of the user's own jams (rkey must be known by the caller). */
export async function deleteJam(agent: Agent, rkey: string): Promise<void> {
  await tryWrite(() =>
    agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: JAM_NSID,
      rkey,
    }),
  )
}

export interface ReJamInput {
  sourceJam: { uri: string; did: string }
  track: JamInput
}

/** Adopt someone else's song as your own current jam, with attribution. */
export async function reJam(
  agent: Agent,
  input: ReJamInput,
): Promise<PostJamResult> {
  return postJam(agent, {
    ...input.track,
    via: { uri: input.sourceJam.uri, did: input.sourceJam.did },
  })
}
