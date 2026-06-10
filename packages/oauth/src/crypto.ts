import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Encrypts OAuth store rows at rest. A stored `NodeSavedSession` contains the
 * refresh token AND the session's DPoP private key — together enough for full
 * account takeover — and a `NodeSavedState` holds a freshly-minted DPoP key and
 * PKCE verifier, so a leaked DB row/backup must not be usable as credentials.
 */
export interface StoreCipher {
  seal(plaintext: string): string
  open(stored: string): string
}

// Versioned prefix so the on-disk format can evolve and plaintext legacy rows
// (written before encryption was enabled) remain readable.
const PREFIX = 'enc1.'
const IV_LEN = 12 // AES-GCM standard nonce size
const TAG_LEN = 16

/**
 * AES-256-GCM cipher over a base64-encoded 32-byte key (`openssl rand -base64 32`).
 * Output format: `enc1.` + base64(iv ‖ ciphertext ‖ tag). `open` passes through
 * values without the prefix unchanged, so enabling encryption on an existing
 * deployment is safe: old plaintext rows stay readable and are re-encrypted on
 * their next write.
 */
export function createStoreCipher(keyBase64: string): StoreCipher {
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== 32) {
    throw new Error(
      'createStoreCipher: key must be 32 bytes base64-encoded — generate with `openssl rand -base64 32`',
    )
  }
  return {
    seal(plaintext: string): string {
      const iv = randomBytes(IV_LEN)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ])
      const tag = cipher.getAuthTag()
      return PREFIX + Buffer.concat([iv, ciphertext, tag]).toString('base64')
    },
    open(stored: string): string {
      if (!stored.startsWith(PREFIX)) return stored // legacy plaintext row
      const buf = Buffer.from(stored.slice(PREFIX.length), 'base64')
      if (buf.length < IV_LEN + TAG_LEN) {
        throw new Error('StoreCipher.open: ciphertext too short')
      }
      const iv = buf.subarray(0, IV_LEN)
      const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN)
      const tag = buf.subarray(buf.length - TAG_LEN)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8')
    },
  }
}
