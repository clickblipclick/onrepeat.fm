import { describe, it, expect } from 'vitest'
import { JAM_NSID, LIKE_NSID } from '@onrepeat/lexicons'
import { postJam, likeJam, unlikeJam, reJam } from './write'

// A structural fake of the @atproto/api Agent surface we use.
function fakeAgent(did = 'did:plc:me') {
  const calls: Array<{ op: string; params: any }> = []
  const agent = {
    assertDid: did,
    com: {
      atproto: {
        repo: {
          async createRecord(params: any) {
            calls.push({ op: 'create', params })
            return { data: { uri: `at://${did}/${params.collection}/rkey1`, cid: 'cid1' } }
          },
          async deleteRecord(params: any) {
            calls.push({ op: 'delete', params })
            return { data: {} }
          },
        },
      },
    },
  }
  return { agent: agent as any, calls }
}

const baseJam = {
  sourceUrl: 'https://open.spotify.com/track/abc',
  sourceProvider: 'spotify',
  title: 'Mr. Brightside',
  artist: 'The Killers',
}

describe('postJam', () => {
  it('creates a jam record in the user repo and returns uri+cid', async () => {
    const { agent, calls } = fakeAgent()
    const res = await postJam(agent, baseJam)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.op).toBe('create')
    expect(calls[0]!.params.repo).toBe('did:plc:me')
    expect(calls[0]!.params.collection).toBe(JAM_NSID)
    expect(calls[0]!.params.record.$type).toBe(JAM_NSID)
    expect(res.uri).toContain(JAM_NSID)
    expect(res.cid).toBe('cid1')
  })
})

describe('likeJam / unlikeJam', () => {
  it('likeJam creates a like pointing at the subject', async () => {
    const { agent, calls } = fakeAgent()
    const subject = { uri: 'at://did:plc:x/fm.onrepeat.jam/1', cid: 'bafyreigh2akiscaildchfkqfxldtxpf2aai3bvgqjt52ow2bfzjlf75vna' }
    await likeJam(agent, subject)
    expect(calls[0]!.params.collection).toBe(LIKE_NSID)
    expect(calls[0]!.params.record.subject).toEqual(subject)
  })

  it('unlikeJam deletes the like by rkey', async () => {
    const { agent, calls } = fakeAgent()
    await unlikeJam(agent, 'rkey1')
    expect(calls[0]!.op).toBe('delete')
    expect(calls[0]!.params.collection).toBe(LIKE_NSID)
    expect(calls[0]!.params.rkey).toBe('rkey1')
  })
})

describe('reJam', () => {
  it('posts a new jam carrying via attribution from the source', async () => {
    const { agent, calls } = fakeAgent()
    await reJam(agent, {
      sourceJam: { uri: 'at://did:plc:src/fm.onrepeat.jam/9', did: 'did:plc:src' },
      track: baseJam,
    })
    const rec = calls[0]!.params.record
    expect(rec.$type).toBe(JAM_NSID)
    expect(rec.via).toEqual({ uri: 'at://did:plc:src/fm.onrepeat.jam/9', did: 'did:plc:src' })
  })
})
