import { describe, expect, it } from 'vitest'

import { mapTypeahead } from './typeahead'

describe('mapTypeahead', () => {
  it('maps handle/displayName/avatar and drops did + extra fields', () => {
    const out = mapTypeahead([
      {
        did: 'did:plc:abc',
        handle: 'alice.bsky.social',
        displayName: 'Alice',
        avatar: 'https://cdn/a.jpg',
        description: 'ignored',
      } as {
        did: string
        handle: string
        displayName?: string
        avatar?: string
      },
    ])
    expect(out).toEqual([
      {
        handle: 'alice.bsky.social',
        displayName: 'Alice',
        avatar: 'https://cdn/a.jpg',
      },
    ])
  })

  it('omits displayName and avatar when absent', () => {
    const out = mapTypeahead([{ did: 'did:plc:x', handle: 'bob.test' }])
    expect(out).toEqual([{ handle: 'bob.test' }])
  })

  it('skips actors with no handle (defensive)', () => {
    const out = mapTypeahead([
      { did: 'did:plc:x', handle: '' },
      { did: 'did:plc:y', handle: 'carol.test' },
    ])
    expect(out).toEqual([{ handle: 'carol.test' }])
  })

  it('returns an empty array for empty input', () => {
    expect(mapTypeahead([])).toEqual([])
  })
})
