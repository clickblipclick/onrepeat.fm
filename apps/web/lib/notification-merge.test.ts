import { describe, expect, it } from 'vitest'

import { mergeIntoPending, mergeNotifications } from './notification-merge'

const n = (recordUri: string) => ({ recordUri })

describe('mergeNotifications', () => {
  it('prepends incoming items that are not already in the list', () => {
    const merged = mergeNotifications([n('c'), n('d')], [n('a'), n('b')])
    expect(merged.map((x) => x.recordUri)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops incoming items already present, keeping the existing entry', () => {
    const existing = [n('b'), n('c')]
    const incoming = [n('a'), { recordUri: 'b', changed: true }]
    const merged = mergeNotifications(existing, incoming)
    expect(merged.map((x) => x.recordUri)).toEqual(['a', 'b', 'c'])
    expect(merged[1]).toBe(existing[0])
  })

  it('returns the existing array unchanged when nothing is new', () => {
    const existing = [n('a'), n('b')]
    expect(mergeNotifications(existing, [n('a'), n('b')])).toBe(existing)
  })

  it('handles an empty existing list', () => {
    expect(
      mergeNotifications([], [n('a'), n('b')]).map((x) => x.recordUri),
    ).toEqual(['a', 'b'])
  })
})

describe('mergeIntoPending', () => {
  it('buffers fresh incoming items ahead of the existing buffer', () => {
    const merged = mergeIntoPending([n('d')], [n('c')], [n('a'), n('b')])
    expect(merged.map((x) => x.recordUri)).toEqual(['a', 'b', 'c'])
  })

  it('excludes items already shown in the list', () => {
    const merged = mergeIntoPending([n('b'), n('c')], [], [n('a'), n('b')])
    expect(merged.map((x) => x.recordUri)).toEqual(['a'])
  })

  it('excludes items already buffered, keeping the buffered entry', () => {
    const pending = [n('a')]
    const redelivered = { recordUri: 'a', changed: true }
    const merged = mergeIntoPending([], pending, [redelivered])
    expect(merged).toBe(pending)
  })

  it('returns the same buffer when nothing is new', () => {
    const pending = [n('b')]
    expect(mergeIntoPending([n('a')], pending, [n('a'), n('b')])).toBe(pending)
  })
})
