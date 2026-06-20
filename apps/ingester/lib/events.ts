import type { Event } from '@atproto/sync'

import type { ActorStatus, FailedEventInput } from '@onrepeat/db'
import { JAM_NSID, LIKE_NSID, PROFILE_NSID } from '@onrepeat/lexicons'

export type IngestCollection =
  | typeof JAM_NSID
  | typeof LIKE_NSID
  | typeof PROFILE_NSID

export interface RecordIngestEvent {
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

/** An upstream account state change (deactivation, takedown, deletion, …). */
export interface AccountIngestEvent {
  action: 'account'
  did: string
  /** Normalized actor status this event maps to. */
  status: ActorStatus
  seq: number
}

export type IngestEvent = RecordIngestEvent | AccountIngestEvent

function isIngestCollection(c: string): c is IngestCollection {
  return c === JAM_NSID || c === LIKE_NSID || c === PROFILE_NSID
}

const KNOWN_INACTIVE: readonly ActorStatus[] = [
  'deactivated',
  'suspended',
  'takendown',
  'deleted',
]

/** Normalize an @atproto/sync Event into an IngestEvent, or null if we ignore it. */
export function toIngestEvent(evt: Event): IngestEvent | null {
  if (evt.event === 'account') {
    if (evt.active) {
      return { action: 'account', did: evt.did, status: 'active', seq: evt.seq }
    }
    // The status vocabulary is open (relays already emit values like
    // 'desynchronized'); treat anything unknown as a generic reversible
    // deactivation rather than failing the event.
    const status = (KNOWN_INACTIVE as readonly string[]).includes(
      evt.status ?? '',
    )
      ? (evt.status as ActorStatus)
      : 'deactivated'
    return { action: 'account', did: evt.did, status, seq: evt.seq }
  }
  if (
    evt.event !== 'create' &&
    evt.event !== 'update' &&
    evt.event !== 'delete'
  ) {
    return null // identity / sync — not indexed
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

/** A short human-readable label for logs/dead-letter messages. */
export function ingestEventLabel(evt: IngestEvent): string {
  return evt.action === 'account'
    ? `account(${evt.status}) ${evt.did}`
    : `${evt.action} ${evt.uri}`
}

/** Shape an IngestEvent for the failed_events dead-letter table. */
export function toFailedEventInput(evt: IngestEvent): FailedEventInput {
  if (evt.action === 'account') {
    return {
      seq: evt.seq,
      did: evt.did,
      collection: '#account',
      action: 'account',
      uri: `at://${evt.did}`,
      cid: null,
      record: { status: evt.status },
    }
  }
  return {
    seq: evt.seq,
    did: evt.did,
    collection: evt.collection,
    action: evt.action,
    uri: evt.uri,
    cid: evt.cid,
    record: evt.record,
  }
}
