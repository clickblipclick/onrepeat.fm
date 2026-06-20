import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { loadKeysetFromJson } from './keyset'

function es256Pem(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
}

describe('loadKeysetFromJson', () => {
  it('loads PKCS8 PEM keys with stable index-derived kids', async () => {
    const keys = await loadKeysetFromJson(
      JSON.stringify([es256Pem(), es256Pem()]),
    )
    expect(keys).toHaveLength(2)
    expect(keys[0]!.kid).toBe('onrepeat-1')
    expect(keys[1]!.kid).toBe('onrepeat-2')
    // Must be usable as an ES256 signing key for private_key_jwt / DPoP.
    expect(keys[0]!.algorithms).toContain('ES256')
    expect(keys[0]!.isPrivate).toBe(true)
  })

  it('rejects non-JSON input', async () => {
    await expect(loadKeysetFromJson('not json')).rejects.toThrow(/valid JSON/)
  })

  it('rejects an empty array', async () => {
    await expect(loadKeysetFromJson('[]')).rejects.toThrow(/non-empty/)
  })

  it('rejects non-key entries', async () => {
    await expect(loadKeysetFromJson('[42]')).rejects.toThrow(/PKCS8 PEM/)
  })
})
