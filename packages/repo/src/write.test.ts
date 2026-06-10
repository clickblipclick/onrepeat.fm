import { describe, it, expect } from 'vitest'
import { JAM_NSID, LIKE_NSID } from '@onrepeat/lexicons'
import {
  postJam,
  likeJam,
  unlikeJam,
  reJam,
  deleteJam,
  RepoWriteError,
} from './write'

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
            return {
              data: {
                uri: `at://${did}/${params.collection}/rkey1`,
                cid: 'cid1',
              },
            }
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
  it('creates a jam record in the user repo and returns uri+cid+record', async () => {
    const { agent, calls } = fakeAgent()
    const res = await postJam(agent, baseJam)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.op).toBe('create')
    expect(calls[0]!.params.repo).toBe('did:plc:me')
    expect(calls[0]!.params.collection).toBe(JAM_NSID)
    expect(calls[0]!.params.record.$type).toBe(JAM_NSID)
    expect(res.uri).toContain(JAM_NSID)
    expect(res.cid).toBe('cid1')
    expect(res.record.title).toBe(baseJam.title)
    expect(res.record.sourceUrl).toBe(baseJam.sourceUrl)
    expect(typeof res.record.createdAt).toBe('string')
  })
})

describe('likeJam / unlikeJam', () => {
  it('likeJam creates a like pointing at the subject', async () => {
    const { agent, calls } = fakeAgent()
    const subject = {
      uri: 'at://did:plc:x/fm.onrepeat.jam/1',
      cid: 'bafyreigh2akiscaildchfkqfxldtxpf2aai3bvgqjt52ow2bfzjlf75vna',
    }
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
  it('posts a new jam carrying via attribution from the source and returns record', async () => {
    const { agent, calls } = fakeAgent()
    const res = await reJam(agent, {
      sourceJam: {
        uri: 'at://did:plc:src/fm.onrepeat.jam/9',
        did: 'did:plc:src',
      },
      track: baseJam,
    })
    const rec = calls[0]!.params.record
    expect(rec.$type).toBe(JAM_NSID)
    expect(rec.via).toEqual({
      uri: 'at://did:plc:src/fm.onrepeat.jam/9',
      did: 'did:plc:src',
    })
    expect(res.uri).toContain(JAM_NSID)
    expect(res.cid).toBe('cid1')
    expect(res.record.title).toBe(baseJam.title)
    expect(res.record.sourceUrl).toBe(baseJam.sourceUrl)
    expect(res.record.via).toEqual({
      uri: 'at://did:plc:src/fm.onrepeat.jam/9',
      did: 'did:plc:src',
    })
  })
})

describe('deleteJam', () => {
  it('deletes a jam by rkey from the user repo', async () => {
    const { agent, calls } = fakeAgent()
    await deleteJam(agent, 'rkey1')
    expect(calls[0]!.op).toBe('delete')
    expect(calls[0]!.params.repo).toBe('did:plc:me')
    expect(calls[0]!.params.collection).toBe(JAM_NSID)
    expect(calls[0]!.params.rkey).toBe('rkey1')
  })
})

function throwingAgent(err: unknown) {
  return {
    assertDid: 'did:plc:me',
    com: {
      atproto: {
        repo: {
          async createRecord() {
            throw err
          },
          async deleteRecord() {
            throw err
          },
        },
      },
    },
  } as any
}

describe('write error classification', () => {
  it('classifies a 401 as auth', async () => {
    const err = Object.assign(new Error('ExpiredToken'), { status: 401 })
    await expect(postJam(throwingAgent(err), baseJam)).rejects.toMatchObject({
      name: 'RepoWriteError',
      kind: 'auth',
      status: 401,
    })
  })

  it('classifies a 429 as rate-limit', async () => {
    const err = Object.assign(new Error('RateLimitExceeded'), { status: 429 })
    const subject = {
      uri: 'at://did:plc:x/fm.onrepeat.jam/1',
      cid: 'bafyreigh2akiscaildchfkqfxldtxpf2aai3bvgqjt52ow2bfzjlf75vna',
    }
    await expect(likeJam(throwingAgent(err), subject)).rejects.toMatchObject({
      kind: 'rate-limit',
    })
  })

  it('classifies a 5xx as transient and preserves the cause', async () => {
    const err = Object.assign(new Error('boom'), { status: 502 })
    const caught = await postJam(throwingAgent(err), baseJam).catch((e) => e)
    expect(caught).toBeInstanceOf(RepoWriteError)
    expect(caught.kind).toBe('transient')
    expect(caught.cause).toBe(err)
  })

  it('classifies a network error as transient', async () => {
    // @atproto/xrpc wraps fetch failures as XRPCError with synthetic status 1
    // (ResponseType.Unknown) — it never rethrows the bare fetch error.
    const err = Object.assign(new Error('fetch failed'), { status: 1 })
    await expect(deleteJam(throwingAgent(err), 'rkey1')).rejects.toMatchObject({
      kind: 'transient',
    })
  })

  it('classifies a statusless error as transient (defensive fallback)', async () => {
    await expect(
      deleteJam(throwingAgent(new Error('fetch failed')), 'rkey1'),
    ).rejects.toMatchObject({ kind: 'transient' })
  })

  it('classifies an InvalidSwap (HTTP 400) as conflict', async () => {
    const err = Object.assign(new Error('InvalidSwap'), {
      status: 400,
      error: 'InvalidSwap',
    })
    await expect(deleteJam(throwingAgent(err), 'rkey1')).rejects.toMatchObject({
      kind: 'conflict',
      status: 400,
    })
  })
})

describe('validationStatus', () => {
  it('surfaces validationStatus from createRecord', async () => {
    const agent = {
      assertDid: 'did:plc:me',
      com: {
        atproto: {
          repo: {
            async createRecord(p: any) {
              return {
                data: {
                  uri: `at://did:plc:me/${p.collection}/1`,
                  cid: 'c',
                  validationStatus: 'unknown',
                },
              }
            },
          },
        },
      },
    } as any
    const res = await postJam(agent, baseJam)
    expect(res.validationStatus).toBe('unknown')
  })
})
