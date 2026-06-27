import type { Event } from '@atproto/sync'
import { describe, expect, it } from 'vitest'

import { JAM_NSID, LIKE_NSID, PROFILE_NSID } from '@onrepeat/lexicons'

import {
  ingestEventLabel,
  toFailedEventInput,
  toIngestEvent,
  type RecordIngestEvent,
} from './events'

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
      uri: 'at://did:plc:author/fm.onrepeat.feed.jam/rkey1',
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
    ) as RecordIngestEvent | null
    expect(evt?.action).toBe('delete')
    expect(evt?.cid).toBeNull()
    expect(evt?.record).toBeUndefined()
    expect(evt?.collection).toBe(LIKE_NSID)
  })

  it('normalizes a profile create (so themes index off the firehose)', () => {
    const record = { $type: PROFILE_NSID, colorTheme: 'plum' }
    const evt = toIngestEvent(
      fakeCommit({
        event: 'create',
        collection: PROFILE_NSID,
        rkey: 'self',
        record,
      }),
    ) as RecordIngestEvent | null
    expect(evt?.collection).toBe(PROFILE_NSID)
    expect(evt?.record).toEqual(record)
  })

  it('ignores collections we do not index', () => {
    expect(
      toIngestEvent(
        fakeCommit({ event: 'create', collection: 'app.bsky.feed.post' }),
      ),
    ).toBeNull()
  })

  it('ignores identity and sync events', () => {
    const identity = {
      event: 'identity',
      seq: 1,
      time: 't',
      did: 'did:plc:author',
    } as unknown as Event
    expect(toIngestEvent(identity)).toBeNull()
    const syncEvt = {
      event: 'sync',
      seq: 2,
      time: 't',
      did: 'did:plc:author',
    } as unknown as Event
    expect(toIngestEvent(syncEvt)).toBeNull()
  })

  function accountEvt(p: { active: boolean; status?: string }): Event {
    return {
      event: 'account',
      seq: 7,
      time: 't',
      did: 'did:plc:author',
      active: p.active,
      status: p.status,
    } as unknown as Event
  }

  it('normalizes account events to actor statuses', () => {
    expect(toIngestEvent(accountEvt({ active: true }))).toEqual({
      action: 'account',
      did: 'did:plc:author',
      status: 'active',
      seq: 7,
    })
    expect(
      toIngestEvent(accountEvt({ active: false, status: 'takendown' })),
    ).toMatchObject({ status: 'takendown' })
    expect(
      toIngestEvent(accountEvt({ active: false, status: 'deleted' })),
    ).toMatchObject({ status: 'deleted' })
  })

  it('maps unknown/missing inactive statuses to deactivated', () => {
    expect(toIngestEvent(accountEvt({ active: false }))).toMatchObject({
      status: 'deactivated',
    })
    expect(
      toIngestEvent(accountEvt({ active: false, status: 'desynchronized' })),
    ).toMatchObject({ status: 'deactivated' })
  })
})

describe('dead-letter shaping', () => {
  it('shapes record events as-is and account events with synthetic uri/collection', () => {
    const record = toIngestEvent(
      fakeCommit({ event: 'create', collection: JAM_NSID, record: {}, seq: 3 }),
    )!
    expect(toFailedEventInput(record)).toMatchObject({
      collection: JAM_NSID,
      action: 'create',
      uri: 'at://did:plc:author/fm.onrepeat.feed.jam/rkey1',
    })
    const account = toIngestEvent({
      event: 'account',
      seq: 9,
      time: 't',
      did: 'did:plc:x',
      active: false,
      status: 'deleted',
    } as unknown as Event)!
    expect(toFailedEventInput(account)).toEqual({
      seq: 9,
      did: 'did:plc:x',
      collection: '#account',
      action: 'account',
      uri: 'at://did:plc:x',
      cid: null,
      record: { status: 'deleted' },
    })
    expect(ingestEventLabel(account)).toBe('account(deleted) did:plc:x')
  })
})
