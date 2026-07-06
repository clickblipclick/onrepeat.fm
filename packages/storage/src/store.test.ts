import {
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'

import { createR2Store, publicUrl, type ObjectClient } from './store'

describe('publicUrl', () => {
  it('joins base and key with a single slash', () => {
    expect(publicUrl('https://art.onrepeat.fm', 'art/abc.jpg')).toBe(
      'https://art.onrepeat.fm/art/abc.jpg',
    )
  })

  it('strips trailing slashes from the base', () => {
    expect(publicUrl('https://art.onrepeat.fm/', 'art/abc.jpg')).toBe(
      'https://art.onrepeat.fm/art/abc.jpg',
    )
  })
})

const cfg = {
  accountId: 'acc',
  accessKeyId: 'ak',
  secretAccessKey: 'sk',
  bucket: 'artwork',
  publicBaseUrl: 'https://cdn.test',
}

describe('createR2Store', () => {
  it('has() returns true when HEAD succeeds', async () => {
    const client: ObjectClient = { send: vi.fn(async () => ({})) }
    const store = createR2Store(cfg, client)
    expect(await store.has('art/x.jpg')).toBe(true)
    const cmd = vi.mocked(client.send).mock.calls[0]![0] as HeadObjectCommand
    expect(cmd).toBeInstanceOf(HeadObjectCommand)
    expect(cmd.input).toMatchObject({ Bucket: 'artwork', Key: 'art/x.jpg' })
  })

  it("has() returns false on the SDK's NotFound error", async () => {
    const err = Object.assign(new Error('not found'), { name: 'NotFound' })
    const client: ObjectClient = {
      send: vi.fn(async () => {
        throw err
      }),
    }
    expect(await createR2Store(cfg, client).has('art/x.jpg')).toBe(false)
  })

  it('has() returns false on a bare 404 in $metadata', async () => {
    const err = Object.assign(new Error('404'), {
      $metadata: { httpStatusCode: 404 },
    })
    const client: ObjectClient = {
      send: vi.fn(async () => {
        throw err
      }),
    }
    expect(await createR2Store(cfg, client).has('art/x.jpg')).toBe(false)
  })

  it('has() rethrows non-404 failures (misconfig must surface)', async () => {
    const err = Object.assign(new Error('forbidden'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    })
    const client: ObjectClient = {
      send: vi.fn(async () => {
        throw err
      }),
    }
    await expect(createR2Store(cfg, client).has('art/x.jpg')).rejects.toBe(err)
  })

  it('put() uploads with content type and immutable cache headers', async () => {
    const client: ObjectClient = { send: vi.fn(async () => ({})) }
    const store = createR2Store(cfg, client)
    await store.put('art/x.jpg', new Uint8Array([1]), 'image/jpeg')
    const cmd = vi.mocked(client.send).mock.calls[0]![0] as PutObjectCommand
    expect(cmd).toBeInstanceOf(PutObjectCommand)
    expect(cmd.input).toMatchObject({
      Bucket: 'artwork',
      Key: 'art/x.jpg',
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  })

  it('urlForKey() joins the public base and key', () => {
    const client: ObjectClient = { send: vi.fn(async () => ({})) }
    expect(createR2Store(cfg, client).urlForKey('art/x.jpg')).toBe(
      'https://cdn.test/art/x.jpg',
    )
  })
})
