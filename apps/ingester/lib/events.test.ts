import { describe, expect, it } from 'vitest'

import {
  FOLLOW_NSID,
  JAM_NSID,
  LIKE_NSID,
  PROFILE_NSID,
} from '@onrepeat/lexicons'

import {
  ingestEventLabel,
  toFailedEventInput,
  toIngestEvent,
  type JetstreamEvent,
  type RecordIngestEvent,
} from './events'

// Structural fakes of the Jetstream v2 raw-event shapes the normalizer reads.
function jsCommit(p: {
  operation: 'create' | 'update' | 'delete'
  collection: string
  did?: string
  rkey?: string
  cid?: string
  record?: unknown
  seq?: number
}): JetstreamEvent {
  const did = p.did ?? 'did:plc:author'
  const rkey = p.rkey ?? 'rkey1'
  const commit =
    p.operation === 'delete'
      ? { operation: 'delete', collection: p.collection, rkey, rev: 'rev1' }
      : {
          operation: p.operation,
          collection: p.collection,
          rkey,
          rev: 'rev1',
          cid: p.cid ?? 'bafyrecord',
          // `??` would turn an explicit null record into {}, hiding the non-object case.
          record: p.record === undefined ? {} : p.record,
        }
  return {
    kind: 'commit',
    did,
    seq: p.seq ?? 1,
    time: '2026-10-17T00:00:00.000000Z',
    commit,
  } as unknown as JetstreamEvent
}

function jsAccount(p: {
  active: boolean
  status?: string
  seq?: number
}): JetstreamEvent {
  return {
    kind: 'account',
    did: 'did:plc:author',
    seq: p.seq ?? 7,
    time: 't',
    account: { did: 'did:plc:author', active: p.active, status: p.status },
  } as unknown as JetstreamEvent
}

describe('toIngestEvent', () => {
  it('normalizes a jam create', () => {
    const record = { $type: JAM_NSID, sourceUrl: 'u' }
    expect(
      toIngestEvent(
        jsCommit({
          operation: 'create',
          collection: JAM_NSID,
          record,
          seq: 42,
        }),
      ),
    ).toEqual({
      action: 'create',
      uri: 'at://did:plc:author/fm.onrepeat.feed.jam/rkey1',
      cid: 'bafyrecord',
      did: 'did:plc:author',
      collection: JAM_NSID,
      record,
      seq: 42,
    })
  })

  it('normalizes an update as update', () => {
    expect(
      toIngestEvent(
        jsCommit({
          operation: 'update',
          collection: PROFILE_NSID,
          rkey: 'self',
          record: { $type: PROFILE_NSID, colorTheme: 'plum' },
        }),
      ),
    ).toMatchObject({
      action: 'update',
      uri: 'at://did:plc:author/fm.onrepeat.actor.profile/self',
    })
  })

  it('normalizes a like delete with null cid and undefined record', () => {
    const evt = toIngestEvent(
      jsCommit({ operation: 'delete', collection: LIKE_NSID }),
    ) as RecordIngestEvent
    expect(evt).toMatchObject({
      action: 'delete',
      cid: null,
      collection: LIKE_NSID,
    })
    expect(evt.record).toBeUndefined()
  })

  it('normalizes a follow create', () => {
    expect(
      toIngestEvent(
        jsCommit({
          operation: 'create',
          collection: FOLLOW_NSID,
          record: { $type: FOLLOW_NSID, subject: 'did:plc:s' },
        }),
      ),
    ).toMatchObject({ collection: FOLLOW_NSID })
  })

  it('converts wire JSON to lex data so {$link} becomes a CID', () => {
    const link = 'bafyreiawtz4aq35l5hzwapnyi3sja5sn3v5v5klkdp2hfrz76ghmnagl5a'
    const evt = toIngestEvent(
      jsCommit({
        operation: 'create',
        collection: JAM_NSID,
        record: { $type: JAM_NSID, ref: { $link: link } },
      }),
    ) as RecordIngestEvent
    const ref = (evt.record as { ref: { toString(): string } }).ref
    expect(typeof ref).toBe('object')
    expect(ref.toString()).toBe(link)
  })

  it('passes a non-object record through unchanged for the indexer to reject', () => {
    expect(
      toIngestEvent(
        jsCommit({ operation: 'create', collection: JAM_NSID, record: null }),
      ),
    ).toMatchObject({ action: 'create', record: null })
    expect(
      toIngestEvent(
        jsCommit({ operation: 'create', collection: JAM_NSID, record: 'nope' }),
      ),
    ).toMatchObject({ record: 'nope' })
  })

  it('ignores collections we do not index, and identity/sync kinds', () => {
    expect(
      toIngestEvent(
        jsCommit({ operation: 'create', collection: 'app.bsky.feed.post' }),
      ),
    ).toBeNull()
    expect(
      toIngestEvent({
        kind: 'identity',
        did: 'did:plc:a',
        seq: 1,
        time: 't',
        identity: { did: 'did:plc:a' },
      } as unknown as JetstreamEvent),
    ).toBeNull()
    expect(
      toIngestEvent({
        kind: 'sync',
        did: 'did:plc:a',
        seq: 2,
        time: 't',
        sync: { did: 'did:plc:a', rev: 'r' },
      } as unknown as JetstreamEvent),
    ).toBeNull()
  })

  it('normalizes account events to actor statuses', () => {
    expect(toIngestEvent(jsAccount({ active: true }))).toEqual({
      action: 'account',
      did: 'did:plc:author',
      status: 'active',
      seq: 7,
    })
    expect(
      toIngestEvent(jsAccount({ active: false, status: 'takendown' })),
    ).toMatchObject({ status: 'takendown' })
    expect(
      toIngestEvent(jsAccount({ active: false, status: 'deleted' })),
    ).toMatchObject({ status: 'deleted' })
  })

  it('maps unknown/missing inactive statuses to deactivated', () => {
    expect(toIngestEvent(jsAccount({ active: false }))).toMatchObject({
      status: 'deactivated',
    })
    expect(
      toIngestEvent(jsAccount({ active: false, status: 'desynchronized' })),
    ).toMatchObject({ status: 'deactivated' })
  })
})

describe('dead-letter shaping', () => {
  it('shapes record events as-is and account events with synthetic uri/collection', () => {
    const record = toIngestEvent(
      jsCommit({
        operation: 'create',
        collection: JAM_NSID,
        record: {},
        seq: 3,
      }),
    )!
    expect(toFailedEventInput(record)).toMatchObject({
      seq: 3,
      collection: JAM_NSID,
      action: 'create',
      uri: 'at://did:plc:author/fm.onrepeat.feed.jam/rkey1',
      cid: 'bafyrecord',
    })
    expect(ingestEventLabel(record)).toBe(
      'create at://did:plc:author/fm.onrepeat.feed.jam/rkey1',
    )

    const account = toIngestEvent(
      jsAccount({ active: false, status: 'deleted', seq: 9 }),
    )!
    expect(toFailedEventInput(account)).toEqual({
      seq: 9,
      did: 'did:plc:author',
      collection: '#account',
      action: 'account',
      uri: 'at://did:plc:author',
      cid: null,
      record: { status: 'deleted' },
    })
    expect(ingestEventLabel(account)).toBe('account(deleted) did:plc:author')
  })
})
