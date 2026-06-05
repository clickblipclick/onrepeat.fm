import { describe, it, expect } from 'vitest'
import type { Event } from '@atproto/sync'
import { JAM_NSID, LIKE_NSID } from '@onrepeat/lexicons'
import { toIngestEvent } from './events'

// Structural fake — toIngestEvent only reads these fields and calls .toString()
// on uri/cid, so we don't need real AtUri/CID instances here.
function fakeCommit(p: {
  event: 'create' | 'update' | 'delete'
  collection: string
  did?: string
  rkey?: string
  cid?: string
  record?: unknown
  seq?: number
}): Event {
  const did = p.did ?? 'did:plc:author'
  const rkey = p.rkey ?? 'rkey1'
  const base = {
    event: p.event,
    seq: p.seq ?? 1,
    time: '2026-05-30T00:00:00.000Z',
    commit: { toString: () => 'bafycommit' },
    rev: 'rev1',
    uri: { toString: () => `at://${did}/${p.collection}/${rkey}` },
    did,
    collection: p.collection,
    rkey,
  }
  if (p.event === 'delete') return base as unknown as Event
  return {
    ...base,
    record: p.record ?? {},
    cid: { toString: () => p.cid ?? 'bafyrecord' },
  } as unknown as Event
}

describe('toIngestEvent', () => {
  it('normalizes a jam create', () => {
    const record = { $type: JAM_NSID, sourceUrl: 'u' }
    const evt = toIngestEvent(
      fakeCommit({ event: 'create', collection: JAM_NSID, record, seq: 42 }),
    )
    expect(evt).toEqual({
      action: 'create',
      uri: 'at://did:plc:author/fm.onrepeat.jam/rkey1',
      cid: 'bafyrecord',
      did: 'did:plc:author',
      collection: JAM_NSID,
      record,
      seq: 42,
    })
  })

  it('normalizes a like delete with null cid and undefined record', () => {
    const evt = toIngestEvent(
      fakeCommit({ event: 'delete', collection: LIKE_NSID }),
    )
    expect(evt?.action).toBe('delete')
    expect(evt?.cid).toBeNull()
    expect(evt?.record).toBeUndefined()
    expect(evt?.collection).toBe(LIKE_NSID)
  })

  it('ignores collections we do not index', () => {
    expect(
      toIngestEvent(
        fakeCommit({ event: 'create', collection: 'app.bsky.feed.post' }),
      ),
    ).toBeNull()
  })

  it('ignores non-commit events', () => {
    const identity = {
      event: 'identity',
      seq: 1,
      time: 't',
      did: 'did:plc:author',
    } as unknown as Event
    expect(toIngestEvent(identity)).toBeNull()
  })
})
