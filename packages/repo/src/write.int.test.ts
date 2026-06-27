import { TestNetworkNoAppView } from '@atproto/dev-env'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { JAM_NSID, LIKE_NSID, validateRecord } from '@onrepeat/lexicons'

import { deleteJam, likeJam, postJam, reJam, unlikeJam } from './write'

let network: TestNetworkNoAppView
let agent: any
let did: string

const baseJam = {
  sourceUrl: 'https://open.spotify.com/track/abc',
  sourceProvider: 'spotify',
  title: 'Mr. Brightside',
  artist: 'The Killers',
  caption: 'on repeat',
}

describe('write ops against a real PDS', () => {
  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({})
    // getAgent() returns an AtpAgent pointed at the PDS; createAccount()
    // sets the session so the agent is immediately authenticated.
    agent = network.pds.getAgent()
    const account = await agent.createAccount({
      handle: 'alice.test',
      email: 'alice@test.com',
      password: 'password123',
    })
    did = account.data.did
    // If createAccount does not leave the agent authenticated, log in:
    if (!agent.session) {
      await agent.login({ identifier: 'alice.test', password: 'password123' })
    }
  }, 120000)

  afterAll(async () => {
    await network?.close()
  })

  it('postJam writes a jam the PDS accepts and reads back valid', async () => {
    const res = await postJam(agent, baseJam)
    expect(res.uri).toContain(JAM_NSID)
    expect(res.record.title).toBe(baseJam.title)
    expect(res.record.sourceUrl).toBe(baseJam.sourceUrl)
    expect(res.record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const rkey = res.uri.split('/').pop()!
    const got = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: JAM_NSID,
      rkey,
    })
    expect(validateRecord(JAM_NSID, got.data.value).success).toBe(true)
    expect((got.data.value as any).caption).toBe('on repeat')
  })

  it('likeJam then unlikeJam adds and removes a like record', async () => {
    const jam = await postJam(agent, baseJam)
    const like = await likeJam(agent, { uri: jam.uri, cid: jam.cid })
    const likeRkey = like.uri.split('/').pop()!

    const before = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: LIKE_NSID,
    })
    expect(before.data.records.length).toBeGreaterThan(0)

    await unlikeJam(agent, likeRkey)
    const after = await agent.com.atproto.repo
      .getRecord({ repo: did, collection: LIKE_NSID, rkey: likeRkey })
      .catch(() => null)
    expect(after).toBeNull()
  })

  it('reJam writes a jam with via attribution the PDS accepts and reads back with via', async () => {
    const source = await postJam(agent, baseJam)
    const sourceUri = source.uri
    const sourceCid = source.cid
    const res = await reJam(agent, {
      sourceJam: { uri: sourceUri, cid: sourceCid },
      track: {
        sourceUrl: baseJam.sourceUrl,
        sourceProvider: baseJam.sourceProvider,
        title: baseJam.title,
        artist: baseJam.artist,
      },
    })
    expect(res.uri).toContain(JAM_NSID)
    expect(res.cid).toBeTruthy()
    expect(res.record.title).toBe(baseJam.title)
    expect(res.record.via).toEqual({ uri: sourceUri, cid: sourceCid })

    const rkey = res.uri.split('/').pop()!
    const got = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: JAM_NSID,
      rkey,
    })
    expect(validateRecord(JAM_NSID, got.data.value).success).toBe(true)
    expect((got.data.value as any).via).toEqual({
      uri: sourceUri,
      cid: sourceCid,
    })
  })

  it('deleteJam removes a jam record from the repo', async () => {
    const jam = await postJam(agent, baseJam)
    const rkey = jam.uri.split('/').pop()!
    const before = await agent.com.atproto.repo
      .getRecord({ repo: did, collection: JAM_NSID, rkey })
      .catch(() => null)
    expect(before).not.toBeNull()

    await deleteJam(agent, rkey)

    const after = await agent.com.atproto.repo
      .getRecord({ repo: did, collection: JAM_NSID, rkey })
      .catch(() => null)
    expect(after).toBeNull()
  })
})
