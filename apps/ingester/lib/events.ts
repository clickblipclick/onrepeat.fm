import type { Event } from '@atproto/sync'
import { JAM_NSID, LIKE_NSID } from '@onrepeat/lexicons'

export type IngestCollection = typeof JAM_NSID | typeof LIKE_NSID

export interface IngestEvent {
  action: 'create' | 'update' | 'delete'
  /** at-uri of the record, e.g. at://did/fm.onrepeat.jam/rkey */
  uri: string
  /** record CID as a string; null on delete */
  cid: string | null
  /** author repo DID */
  did: string
  collection: IngestCollection
  /** decoded record value; undefined on delete */
  record: unknown
  /** firehose sequence cursor */
  seq: number
}

function isIngestCollection(c: string): c is IngestCollection {
  return c === JAM_NSID || c === LIKE_NSID
}

/** Normalize an @atproto/sync Event into an IngestEvent, or null if we ignore it. */
export function toIngestEvent(evt: Event): IngestEvent | null {
  if (evt.event !== 'create' && evt.event !== 'update' && evt.event !== 'delete') {
    return null // identity / account / sync — not indexed
  }
  if (!isIngestCollection(evt.collection)) return null

  if (evt.event === 'delete') {
    return {
      action: 'delete',
      uri: evt.uri.toString(),
      cid: null,
      did: evt.did,
      collection: evt.collection,
      record: undefined,
      seq: evt.seq,
    }
  }

  return {
    action: evt.event,
    uri: evt.uri.toString(),
    cid: evt.cid.toString(),
    did: evt.did,
    collection: evt.collection,
    record: evt.record,
    seq: evt.seq,
  }
}
