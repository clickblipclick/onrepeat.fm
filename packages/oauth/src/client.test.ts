import { describe, it, expect, beforeEach } from 'vitest'
import { JoseKey } from '@atproto/jwk-jose'
import { createOAuthClient } from './client'

function memStore() {
  const m = new Map<string, string>()
  return {
    async get(k: string) {
      const v = m.get(k)
      return v ? JSON.parse(v) : undefined
    },
    async set(k: string, val: unknown) {
      m.set(k, JSON.stringify(val))
    },
    async del(k: string) {
      m.delete(k)
    },
  }
}

describe('createOAuthClient', () => {
  let stateStore: any
  let sessionStore: any
  beforeEach(() => {
    stateStore = memStore()
    sessionStore = memStore()
  })

  it('dev mode builds a loopback client with a 127.0.0.1 redirect and no keyset', () => {
    const client = createOAuthClient({
      mode: 'dev',
      publicUrl: 'http://127.0.0.1:3000',
      stateStore,
      sessionStore,
    })
    expect(client.clientMetadata.client_id.startsWith('http://localhost')).toBe(true)
    expect(JSON.stringify(client.clientMetadata.redirect_uris)).toContain(
      'http://127.0.0.1:3000/oauth/callback',
    )
  })

  it('prod mode builds a hosted client_id and requires a keyset', async () => {
    const keyset = [await JoseKey.generate(['ES256'], 'key1')]
    const client = createOAuthClient({
      mode: 'prod',
      publicUrl: 'https://onrepeat.fm',
      keyset,
      stateStore,
      sessionStore,
    })
    expect(client.clientMetadata.client_id).toBe('https://onrepeat.fm/client-metadata.json')
    expect(client.clientMetadata.token_endpoint_auth_method).toBe('private_key_jwt')
  })

  it('prod mode without a keyset throws', () => {
    expect(() =>
      createOAuthClient({
        mode: 'prod',
        publicUrl: 'https://onrepeat.fm',
        stateStore,
        sessionStore,
      }),
    ).toThrow(/keyset/i)
  })
})
