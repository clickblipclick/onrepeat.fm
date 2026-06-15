import { describe, it, expect } from 'vitest'
import { isPostDirty } from './post-form'

describe('isPostDirty', () => {
  it('is false on a pristine form', () => {
    expect(isPostDirty({ trackContent: false, caption: '' })).toBe(false)
  })

  it('is true once a track has been picked or typed', () => {
    expect(isPostDirty({ trackContent: true, caption: '' })).toBe(true)
  })

  it('is true once a caption has non-whitespace content', () => {
    expect(isPostDirty({ trackContent: false, caption: 'why this song' })).toBe(
      true,
    )
  })

  it('ignores whitespace-only captions', () => {
    expect(isPostDirty({ trackContent: false, caption: '   ' })).toBe(false)
  })
})
