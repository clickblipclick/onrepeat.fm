import { describe, expect, it } from 'vitest'

import {
  extFromContentType,
  isImageContentType,
  matchesImageSignature,
} from './content-type'

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

describe('matchesImageSignature', () => {
  const cases: Array<[string, number[]]> = [
    ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0]],
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]],
    // 'GIF87a' and 'GIF89a'
    ['image/gif', [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]],
    ['image/gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    // 'RIFF' + 4 size bytes + 'WEBP'
    // prettier-ignore
    ['image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
    // 4 size bytes + 'ftyp' + brand 'avif'
    // prettier-ignore
    ['image/avif', [0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]],
  ]

  it('accepts each format by its magic bytes', () => {
    for (const [ct, bytes] of cases)
      expect(matchesImageSignature(ct, new Uint8Array(bytes))).toBe(true)
  })

  it('rejects bytes whose signature does not match the claimed type', () => {
    expect(
      matchesImageSignature('image/jpeg', new Uint8Array([1, 2, 3, 4])),
    ).toBe(false)
    // PNG bytes claimed as JPEG
    expect(
      matchesImageSignature(
        'image/jpeg',
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(false)
  })

  it('rejects truncated buffers and unknown types', () => {
    expect(matchesImageSignature('image/png', new Uint8Array([0x89]))).toBe(
      false,
    )
    expect(matchesImageSignature('image/jpeg', new Uint8Array([]))).toBe(false)
    expect(
      matchesImageSignature('text/html', new Uint8Array([0xff, 0xd8, 0xff])),
    ).toBe(false)
  })
})
