import { jsonToLex } from '@atproto/lexicon'
import type { Event } from '@atproto/sync'
import type { RawEvent, RawRecordJson } from '@bsky/jetstream'

import type { ActorStatus, FailedEventInput } from '@onrepeat/db'
import {
  FOLLOW_NSID,
  JAM_NSID,
  LIKE_NSID,
  PROFILE_NSID,
} from '@onrepeat/lexicons'

export type IngestCollection =
  typeof JAM_NSID | typeof LIKE_NSID | typeof PROFILE_NSID | typeof FOLLOW_NSID

export interface RecordIngestEvent {
  action: 'create' | 'update' | 'delete'
  /** at-uri of the record, e.g. at://did/fm.onrepeat.feed.jam/rkey */
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
  return (
    c === JAM_NSID || c === LIKE_NSID || c === PROFILE_NSID || c === FOLLOW_NSID
  )
}

const KNOWN_INACTIVE: readonly ActorStatus[] = [
  'deactivated',
  'suspended',
  'takendown',
  'deleted',
]

/**
 * Map an upstream account event onto our actor status. The status vocabulary is
 * open (relays already emit values like 'desynchronized'); anything unknown is
 * treated as a generic reversible deactivation rather than failing the event.
 */
function accountStatus(
  active: boolean,
  status: string | undefined,
): ActorStatus {
  if (active) return 'active'
  return (KNOWN_INACTIVE as readonly string[]).includes(status ?? '')
    ? (status as ActorStatus)
    : 'deactivated'
}

/** A Jetstream v2 live event as the SDK yields it in `raw: true` mode. */
export type JetstreamEvent = RawEvent<RawRecordJson>

/**
 * Wire JSON → lex data (`{$link}` → CID, `{$bytes}` → Uint8Array, blob refs →
 * BlobRef), so `validateRecord` sees the same shapes the CAR-decoded firehose
 * path produced. A value that cannot be converted (not a record at all) is passed
 * through unchanged for the lexicon validator to reject.
 */
function lexRecord(record: unknown): unknown {
  try {
    return jsonToLex(record as Parameters<typeof jsonToLex>[0])
  } catch {
    return record
  }
}

/** Normalize a Jetstream event into an IngestEvent, or null if we ignore it. */
export function toIngestEvent(evt: JetstreamEvent): IngestEvent | null {
  if (evt.kind === 'account') {
    return {
      action: 'account',
      did: evt.did,
      status: accountStatus(evt.account.active, evt.account.status),
      seq: evt.seq,
    }
  }
  if (evt.kind !== 'commit') return null // identity / sync — not indexed
  const { commit } = evt
  if (!isIngestCollection(commit.collection)) return null

  const uri = `at://${evt.did}/${commit.collection}/${commit.rkey}`
  if (commit.operation === 'delete') {
    return {
      action: 'delete',
      uri,
      cid: null,
      did: evt.did,
      collection: commit.collection,
      record: undefined,
      seq: evt.seq,
    }
  }
  return {
    action: commit.operation,
    uri,
    cid: commit.cid,
    did: evt.did,
    collection: commit.collection,
    record: lexRecord(commit.record),
    seq: evt.seq,
  }
}

/** Normalize an @atproto/sync Event into an IngestEvent, or null if we ignore it. */
export function toIngestEventFromFirehose(evt: Event): IngestEvent | null {
  if (evt.event === 'account') {
    return {
      action: 'account',
      did: evt.did,
      status: accountStatus(evt.active, evt.status),
      seq: evt.seq,
    }
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
