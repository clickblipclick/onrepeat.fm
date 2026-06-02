import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
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

  it('requests least-privilege granular scopes (only our collections, not transition:generic)', () => {
    const client = createOAuthClient({
      mode: 'dev',
      publicUrl: 'http://127.0.0.1:3000',
      stateStore,
      sessionStore,
    })
    const scope = client.clientMetadata.scope ?? ''
    expect(scope).toContain('repo:fm.onrepeat.jam')
    expect(scope).toContain('repo:fm.onrepeat.like')
    expect(scope).not.toContain('transition:generic')
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

  describe('requestLock forwarding', () => {
    let warn: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })
    afterEach(() => {
      warn.mockRestore()
    })

    const lockWarning = () =>
      warn.mock.calls.some((args) =>
        args.some((a) => typeof a === 'string' && a.includes('No lock mechanism')),
      )

    it('warns when no requestLock is provided (library in-process fallback)', () => {
      createOAuthClient({
        mode: 'dev',
        publicUrl: 'http://127.0.0.1:3000',
        stateStore,
        sessionStore,
      })
      expect(lockWarning()).toBe(true)
    })

    it('forwards a provided requestLock so the missing-lock warning is silenced', () => {
      const requestLock = async <T>(_name: string, fn: () => T | PromiseLike<T>) => fn()
      createOAuthClient({
        mode: 'dev',
        publicUrl: 'http://127.0.0.1:3000',
        stateStore,
        sessionStore,
        requestLock,
      })
      expect(lockWarning()).toBe(false)
    })
  })
})
