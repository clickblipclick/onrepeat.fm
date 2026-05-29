import type { Agent } from '@atproto/api'
import { JAM_NSID, LIKE_NSID, type StrongRef } from '@onrepeat/lexicons'
import { buildJamRecord, buildLikeRecord, type JamInput } from './records'

export interface WriteResult {
  uri: string
  cid: string
}

/** Write the user's current jam (a new append-only record) to their repo. */
export async function postJam(agent: Agent, input: JamInput): Promise<WriteResult> {
  const record = buildJamRecord(input)
  const res = await agent.com.atproto.repo.createRecord({
    repo: agent.assertDid,
    collection: JAM_NSID,
    record: record as unknown as Record<string, unknown>,
  })
  return { uri: res.data.uri, cid: res.data.cid }
}

/** Like a jam by writing a like record referencing its strongRef. */
export async function likeJam(agent: Agent, subject: StrongRef): Promise<WriteResult> {
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

export interface ReJamInput {
  sourceJam: { uri: string; did: string }
  track: JamInput
}

/** Adopt someone else's song as your own current jam, with attribution. */
export async function reJam(agent: Agent, input: ReJamInput): Promise<WriteResult> {
  return postJam(agent, {
    ...input.track,
    via: { uri: input.sourceJam.uri, did: input.sourceJam.did },
  })
}
