import type { Agent } from '@atproto/api'
import {
  JAM_NSID,
  LIKE_NSID,
  type StrongRef,
  type JamRecord,
} from '@onrepeat/lexicons'
import { buildJamRecord, buildLikeRecord, type JamInput } from './records'

export interface WriteResult {
  uri: string
  cid: string
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
  const res = await agent.com.atproto.repo.createRecord({
    repo: agent.assertDid,
    collection: JAM_NSID,
    record: record as unknown as Record<string, unknown>,
  })
  return { uri: res.data.uri, cid: res.data.cid, record }
}

/** Like a jam by writing a like record referencing its strongRef. */
export async function likeJam(
  agent: Agent,
  subject: StrongRef,
): Promise<WriteResult> {
  const record = buildLikeRecord(subject)
  const res = await agent.com.atproto.repo.createRecord({
    repo: agent.assertDid,
    collection: LIKE_NSID,
    record: record as unknown as Record<string, unknown>,
  })
  return { uri: res.data.uri, cid: res.data.cid }
}

/** Un-like by deleting the like record (rkey must be known by the caller). */
export async function unlikeJam(agent: Agent, rkey: string): Promise<void> {
  await agent.com.atproto.repo.deleteRecord({
    repo: agent.assertDid,
    collection: LIKE_NSID,
    rkey,
  })
}

/** Delete one of the user's own jams (rkey must be known by the caller). */
export async function deleteJam(agent: Agent, rkey: string): Promise<void> {
  await agent.com.atproto.repo.deleteRecord({
    repo: agent.assertDid,
    collection: JAM_NSID,
    rkey,
  })
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
