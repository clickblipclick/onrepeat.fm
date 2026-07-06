import { describe, expect, it } from 'vitest'

import { parseUnreadEvent } from './unread-stream'

describe('parseUnreadEvent', () => {
  it('parses a well-formed unread event', () => {
    expect(parseUnreadEvent('{"unread":3}')).toBe(3)
  })

  it('parses a zero count', () => {
    expect(parseUnreadEvent('{"unread":0}')).toBe(0)
  })

  it('rejects malformed JSON', () => {
    expect(parseUnreadEvent('not json')).toBeNull()
  })

  it('rejects a missing unread field', () => {
    expect(parseUnreadEvent('{}')).toBeNull()
  })

  it('rejects non-numeric and non-finite counts', () => {
    expect(parseUnreadEvent('{"unread":"3"}')).toBeNull()
    expect(parseUnreadEvent('{"unread":null}')).toBeNull()
  })

  it('rejects negative and fractional counts', () => {
    expect(parseUnreadEvent('{"unread":-1}')).toBeNull()
    expect(parseUnreadEvent('{"unread":2.5}')).toBeNull()
  })
})
