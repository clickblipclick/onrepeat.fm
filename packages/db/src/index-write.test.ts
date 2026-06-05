import { describe, it, expect } from 'vitest'
import { JAM_NSID, LIKE_NSID } from '@onrepeat/lexicons'
import { jamRow, likeRow } from './index-write'

describe('jamRow', () => {
  it('maps a jam record to a row with track_id null', () => {
    const row = jamRow(
      'at://did:plc:x/fm.onrepeat.jam/1',
      'bafyjam',
      'did:plc:x',
      {
        $type: JAM_NSID,
        sourceUrl: 'https://open.spotify.com/track/1',
        sourceProvider: 'spotify',
        title: 'Song',
        artist: 'Artist',
        caption: 'vibes',
        createdAt: '2026-05-30T00:00:00.000Z',
      },
    )
    expect(row).toMatchObject({
      uri: 'at://did:plc:x/fm.onrepeat.jam/1',
      cid: 'bafyjam',
      author_did: 'did:plc:x',
      track_id: null,
      source_url: 'https://open.spotify.com/track/1',
      source_provider: 'spotify',
      raw_title: 'Song',
      raw_artist: 'Artist',
      caption: 'vibes',
      via_uri: null,
      via_did: null,
      created_at: '2026-05-30T00:00:00.000Z',
    })
  })

  it('defaults caption and via to null when absent', () => {
    const row = jamRow(
      'at://did:plc:x/fm.onrepeat.jam/3',
      'bafy',
      'did:plc:x',
      {
        $type: JAM_NSID,
        sourceUrl: 'u',
        sourceProvider: 'spotify',
        title: 't',
        artist: 'a',
        createdAt: '2026-05-30T00:00:00.000Z',
      },
    )
    expect(row.caption).toBeNull()
    expect(row.via_uri).toBeNull()
    expect(row.via_did).toBeNull()
  })

  it('maps artworkUrl to raw_artwork_url (null when absent)', () => {
    expect(
      jamRow('at://x/1', 'c', 'did:plc:a', {
        $type: 'fm.onrepeat.jam',
        sourceUrl: 'u',
        sourceProvider: 'spotify',
        title: 'T',
        artist: 'A',
        artworkUrl: 'art.jpg',
        createdAt: '2026-06-01T00:00:00.000Z',
      }).raw_artwork_url,
    ).toBe('art.jpg')
    expect(
      jamRow('at://x/2', 'c', 'did:plc:a', {
        $type: 'fm.onrepeat.jam',
        sourceUrl: 'u',
        sourceProvider: 'spotify',
        title: 'T',
        artist: 'A',
        createdAt: '2026-06-01T00:00:00.000Z',
      }).raw_artwork_url,
    ).toBeNull()
  })

  it('maps re-jam via attribution when present', () => {
    const row = jamRow(
      'at://did:plc:x/fm.onrepeat.jam/2',
      'bafy',
      'did:plc:x',
      {
        $type: JAM_NSID,
        sourceUrl: 'u',
        sourceProvider: 'youtube',
        title: 't',
        artist: 'a',
        createdAt: '2026-05-30T00:00:00.000Z',
        via: { uri: 'at://did:plc:y/fm.onrepeat.jam/9', did: 'did:plc:y' },
      },
    )
    expect(row.via_uri).toBe('at://did:plc:y/fm.onrepeat.jam/9')
    expect(row.via_did).toBe('did:plc:y')
  })
})

describe('likeRow', () => {
  it('maps a like record to a row', () => {
    const row = likeRow('at://did:plc:x/fm.onrepeat.like/1', 'did:plc:x', {
      $type: LIKE_NSID,
      subject: { uri: 'at://did:plc:y/fm.onrepeat.jam/1', cid: 'bafyjam' },
      createdAt: '2026-05-30T00:00:00.000Z',
    })
    expect(row).toMatchObject({
      uri: 'at://did:plc:x/fm.onrepeat.like/1',
      author_did: 'did:plc:x',
      subject_uri: 'at://did:plc:y/fm.onrepeat.jam/1',
      created_at: '2026-05-30T00:00:00.000Z',
    })
  })
})
