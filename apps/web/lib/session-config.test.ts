import { describe, it, expect } from 'vitest'
import {
  sessionCookieOptions,
  sessionOptions,
  SESSION_COOKIE_NAME,
  type SessionData,
} from './session-config'

describe('session cookie config', () => {
  it('is httpOnly and lax, and only secure in production', () => {
    const dev = sessionCookieOptions('development')
    expect(dev?.httpOnly).toBe(true)
    expect(dev?.sameSite).toBe('lax')
    expect(dev?.secure).toBe(false)

    const prod = sessionCookieOptions('production')
    expect(prod?.secure).toBe(true)
    expect(prod?.httpOnly).toBe(true)
  })

  it('the cookie name is stable', () => {
    expect(SESSION_COOKIE_NAME).toBe('onrepeat_session')
  })

  it('SessionData carries only a did (no tokens)', () => {
    const data: SessionData = { did: 'did:plc:x' }
    expect(Object.keys(data)).toEqual(['did'])
  })

  it('sessionOptions throws when SESSION_SECRET is too short', () => {
    const prev = process.env.SESSION_SECRET
    process.env.SESSION_SECRET = 'short'
    try {
      expect(() => sessionOptions()).toThrow(/SESSION_SECRET/)
    } finally {
      if (prev === undefined) delete process.env.SESSION_SECRET
      else process.env.SESSION_SECRET = prev
    }
  })
})
