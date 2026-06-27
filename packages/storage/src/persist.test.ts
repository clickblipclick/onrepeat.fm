import { describe, expect, it, vi } from 'vitest'

import { persistArtwork } from './persist'
import type { ArtworkStore } from './store'

const TRUSTED = 'https://is1-ssl.mzstatic.com/image/a/600x600bb.jpg'

function fakeStore(overrides: Partial<ArtworkStore> = {}): ArtworkStore {
  return {
    has: vi.fn(async () => false),
    put: vi.fn(async () => {}),
    urlForKey: (key) => `https://cdn.test/${key}`,
    ...overrides,
  }
}

function imageResponse(bytes: Uint8Array, contentType = 'image/jpeg') {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    body: null,
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response
}

function streamingImageResponse(
  chunks: Uint8Array[],
  contentType = 'image/jpeg',
) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c)
        controller.close()
      },
    }),
    arrayBuffer: async () => {
      throw new Error('should not be called on the streaming path')
    },
  } as unknown as Response
}

function erroringStreamResponse(contentType = 'image/jpeg') {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('mid-stream reset'))
      },
    }),
    arrayBuffer: async () => {
      throw new Error('unused')
    },
  } as unknown as Response
}

describe('persistArtwork', () => {
  it('rejects a non-allowlisted host without fetching', async () => {
    const fetchFn = vi.fn()
    const store = fakeStore()
    const url = await persistArtwork('https://evil.example/a.jpg', store, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })
    expect(url).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('uploads and returns the CDN url for trusted image bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const store = fakeStore()
    const fetchFn = vi.fn(async () => imageResponse(bytes))
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })
    // sha256 of [1,2,3,4] is deterministic; key is art/<hash>.jpg
    expect(url).toMatch(/^https:\/\/cdn\.test\/art\/[0-9a-f]{64}\.jpg$/)
    expect(store.put).toHaveBeenCalledOnce()
  })

  it('skips upload when the object already exists (dedup)', async () => {
    const bytes = new Uint8Array([9, 9, 9])
    const store = fakeStore({ has: vi.fn(async () => true) })
    const fetchFn = vi.fn(async () => imageResponse(bytes))
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })
    expect(url).toMatch(/^https:\/\/cdn\.test\/art\//)
    expect(store.put).not.toHaveBeenCalled()
  })

  it('rejects a non-image content type', async () => {
    const store = fakeStore()
    const fetchFn = vi.fn(async () =>
      imageResponse(new Uint8Array([1]), 'text/html'),
    )
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })
    expect(url).toBeNull()
    expect(store.put).not.toHaveBeenCalled()
  })

  it('rejects an oversize image', async () => {
    const bytes = new Uint8Array(11)
    const store = fakeStore()
    const fetchFn = vi.fn(async () => imageResponse(bytes))
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
      maxBytes: 10,
    })
    expect(url).toBeNull()
  })

  it('returns null when the fetch throws', async () => {
    const store = fakeStore()
    const fetchFn = vi.fn(async () => {
      throw new Error('network')
    })
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })
    expect(url).toBeNull()
  })

  it('uploads via the streaming body path (chunks reassembled)', async () => {
    const store = fakeStore()
    const fetchFn = vi.fn(async () =>
      streamingImageResponse([new Uint8Array([1, 2]), new Uint8Array([3, 4])]),
    )
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })
    // same reassembled bytes [1,2,3,4] as the arrayBuffer happy path → same key
    expect(url).toMatch(/^https:\/\/cdn\.test\/art\/[0-9a-f]{64}\.jpg$/)
    expect(store.put).toHaveBeenCalledOnce()
  })

  it('rejects an oversize image on the streaming path', async () => {
    const store = fakeStore()
    const fetchFn = vi.fn(async () =>
      streamingImageResponse([new Uint8Array(6), new Uint8Array(6)]),
    )
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
      maxBytes: 10,
    })
    expect(url).toBeNull()
    expect(store.put).not.toHaveBeenCalled()
  })

  it('returns null when the body stream errors mid-stream', async () => {
    const store = fakeStore()
    const fetchFn = vi.fn(async () => erroringStreamResponse())
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })
    expect(url).toBeNull()
    expect(store.put).not.toHaveBeenCalled()
  })
})
