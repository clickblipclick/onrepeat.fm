import { describe, expect, it } from 'vitest'

import { publicUrl } from './store'

describe('publicUrl', () => {
  it('joins base and key with a single slash', () => {
    expect(publicUrl('https://art.onrepeat.fm', 'art/abc.jpg')).toBe(
      'https://art.onrepeat.fm/art/abc.jpg',
    )
  })

  it('strips trailing slashes from the base', () => {
    expect(publicUrl('https://art.onrepeat.fm/', 'art/abc.jpg')).toBe(
      'https://art.onrepeat.fm/art/abc.jpg',
    )
  })
})
