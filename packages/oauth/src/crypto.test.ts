import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createStoreCipher } from './crypto'

const key = randomBytes(32).toString('base64')

describe('createStoreCipher', () => {
  it('round-trips a JSON payload', () => {
    const cipher = createStoreCipher(key)
    const payload = JSON.stringify({ tokenSet: { refresh_token: 'rt-secret' } })
    const sealed = cipher.seal(payload)
    expect(sealed).toMatch(/^enc1\./)
    expect(sealed).not.toContain('rt-secret')
    expect(cipher.open(sealed)).toBe(payload)
  })

  it('produces a fresh nonce per seal', () => {
    const cipher = createStoreCipher(key)
    expect(cipher.seal('x')).not.toBe(cipher.seal('x'))
  })

  it('passes legacy plaintext rows through open() unchanged', () => {
    const cipher = createStoreCipher(key)
    const plaintext = '{"did":"did:plc:abc"}'
    expect(cipher.open(plaintext)).toBe(plaintext)
  })

  it('rejects tampered ciphertext', () => {
    const cipher = createStoreCipher(key)
    const sealed = cipher.seal('secret')
    const buf = Buffer.from(sealed.slice('enc1.'.length), 'base64')
    buf[12] = buf[12]! ^ 0xff // flip a ciphertext bit
    expect(() => cipher.open('enc1.' + buf.toString('base64'))).toThrow()
  })

  it('rejects ciphertext sealed under a different key', () => {
    const sealed = createStoreCipher(key).seal('secret')
    const other = createStoreCipher(randomBytes(32).toString('base64'))
    expect(() => other.open(sealed)).toThrow()
  })

  it('rejects keys that are not 32 bytes', () => {
    expect(() => createStoreCipher(randomBytes(16).toString('base64'))).toThrow(
      /32 bytes/,
    )
    expect(() => createStoreCipher('not-base64!!')).toThrow(/32 bytes/)
  })
})
