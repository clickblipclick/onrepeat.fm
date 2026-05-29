import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { TestNetworkNoAppView } from '@atproto/dev-env'
import { JAM_NSID, LIKE_NSID, validateRecord } from '@onrepeat/lexicons'
import { postJam, likeJam, unlikeJam } from './write'

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
    const rkey = res.uri.split('/').pop()!
    const got = await agent.com.atproto.repo.getRecord({ repo: did, collection: JAM_NSID, rkey })
    expect(validateRecord(JAM_NSID, got.data.value).success).toBe(true)
    expect((got.data.value as any).caption).toBe('on repeat')
  })

  it('likeJam then unlikeJam adds and removes a like record', async () => {
    const jam = await postJam(agent, baseJam)
    const like = await likeJam(agent, { uri: jam.uri, cid: jam.cid })
    const likeRkey = like.uri.split('/').pop()!

    const before = await agent.com.atproto.repo.listRecords({ repo: did, collection: LIKE_NSID })
    expect(before.data.records.length).toBeGreaterThan(0)

    await unlikeJam(agent, likeRkey)
    const after = await agent.com.atproto.repo
      .getRecord({ repo: did, collection: LIKE_NSID, rkey: likeRkey })
      .catch(() => null)
    expect(after).toBeNull()
  })
})
