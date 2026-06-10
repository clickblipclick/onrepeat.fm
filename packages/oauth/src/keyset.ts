import { JoseKey } from '@atproto/jwk-jose'

/**
 * Load the confidential client's signing keyset from the OAUTH_PRIVATE_KEYS env
 * value: a JSON array of importable private keys (PKCS8 PEM strings or JWK
 * objects). Keys get stable index-derived kids (`onrepeat-1`, `onrepeat-2`, …),
 * which the auth server uses to pick the verification key from our jwks_uri —
 * so APPEND new keys when rotating; never reorder or the kids change meaning.
 */
export async function loadKeysetFromJson(json: string): Promise<JoseKey[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('OAUTH_PRIVATE_KEYS must be valid JSON (an array of keys)')
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      'OAUTH_PRIVATE_KEYS must be a non-empty JSON array of PKCS8 PEM strings or JWK objects',
    )
  }
  return Promise.all(
    parsed.map((key, i) => {
      if (typeof key !== 'string' && (typeof key !== 'object' || key == null)) {
        throw new Error(
          `OAUTH_PRIVATE_KEYS[${i}] must be a PKCS8 PEM string or a JWK object`,
        )
      }
      return JoseKey.fromImportable(
        key as Parameters<typeof JoseKey.fromImportable>[0],
        `onrepeat-${i + 1}`,
      )
    }),
  )
}
