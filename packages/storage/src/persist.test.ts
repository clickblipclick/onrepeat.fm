import { describe, expect, it, vi } from 'vitest'

import { persistArtwork } from './persist'
import type { ArtworkStore } from './store'

const TRUSTED = 'https://is1-ssl.mzstatic.com/image/a/600x600bb.jpg'

/** Bytes that pass the image/jpeg magic-byte check (FF D8 FF). */
function jpegBytes(...tail: number[]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, ...tail])
}

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
    const bytes = jpegBytes(4)
    const store = fakeStore()
    const fetchFn = vi.fn(async () => imageResponse(bytes))
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })
    // sha256 of the bytes is deterministic; key is art/<hash>.jpg
    expect(url).toMatch(/^https:\/\/cdn\.test\/art\/[0-9a-f]{64}\.jpg$/)
    expect(store.put).toHaveBeenCalledOnce()
  })

  it('skips upload when the object already exists (dedup)', async () => {
    const bytes = jpegBytes(9)
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

  it('rejects bytes that do not match the claimed content type', async () => {
    const store = fakeStore()
    const onSkip = vi.fn()
    const fetchFn = vi.fn(async () =>
      imageResponse(new Uint8Array([1, 2, 3, 4]), 'image/jpeg'),
    )
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
      onSkip,
    })
    expect(url).toBeNull()
    expect(store.put).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledWith('bad-signature', 'image/jpeg')
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
    // JPEG signature split across chunks: the check must run on reassembled bytes.
    const fetchFn = vi.fn(async () =>
      streamingImageResponse([
        new Uint8Array([0xff, 0xd8]),
        new Uint8Array([0xff, 4]),
      ]),
    )
    const url = await persistArtwork(TRUSTED, store, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })
    // same reassembled bytes as the arrayBuffer happy path → same key
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

  it('reports why it skipped via onSkip', async () => {
    const onSkip = vi.fn()
    await persistArtwork('https://evil.example/a.jpg', fakeStore(), { onSkip })
    expect(onSkip).toHaveBeenCalledWith('untrusted-url', undefined)

    const storeErr = new Error('AccessDenied')
    const failing = fakeStore({
      has: vi.fn(async () => {
        throw storeErr
      }),
    })
    onSkip.mockClear()
    const fetchFn = vi.fn(async () => imageResponse(jpegBytes(1)))
    const url = await persistArtwork(TRUSTED, failing, {
      fetchFn: fetchFn as unknown as typeof fetch,
      onSkip,
    })
    expect(url).toBeNull()
    expect(onSkip).toHaveBeenCalledWith('store-failed', storeErr)
  })

  it('never throws, even when onSkip itself throws', async () => {
    const onSkip = vi.fn(() => {
      throw new Error('logger exploded')
    })
    const url = await persistArtwork('https://evil.example/a.jpg', fakeStore(), {
      onSkip,
    })
    expect(url).toBeNull()
    expect(onSkip).toHaveBeenCalled()
  })
})
