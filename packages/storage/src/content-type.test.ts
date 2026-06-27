import { describe, expect, it } from 'vitest'

import { extFromContentType, isImageContentType } from './content-type'

describe('content-type helpers', () => {
  it('accepts known raster image types', () => {
    for (const ct of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ])
      expect(isImageContentType(ct)).toBe(true)
  })

  it('rejects non-image and unsafe image types', () => {
    expect(isImageContentType('text/html')).toBe(false)
    expect(isImageContentType('image/svg+xml')).toBe(false)
    expect(isImageContentType('')).toBe(false)
  })

  it('maps content types to file extensions', () => {
    expect(extFromContentType('image/jpeg')).toBe('jpg')
    expect(extFromContentType('image/png')).toBe('png')
    expect(extFromContentType('image/webp')).toBe('webp')
  })
})
