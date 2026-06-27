import { createHash } from 'node:crypto'

import { isTrustedArtworkUrl } from '@onrepeat/core'

import { extFromContentType, isImageContentType } from './content-type'
import type { ArtworkStore } from './store'

export interface PersistOptions {
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch
  /** Max image size in bytes (default 5 MiB). Oversize → null. */
  maxBytes?: number
  /** Per-request timeout in ms (default 10s). */
  timeoutMs?: number
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 10_000

/** Read a response body as bytes, aborting once it exceeds `maxBytes`. Returns null over the cap. */
async function readBytesCapped(
  res: {
    body?: ReadableStream<Uint8Array> | null
    arrayBuffer(): Promise<ArrayBuffer>
  },
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer())
    return buf.byteLength > maxBytes ? null : buf
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/**
 * Download cover art from a trusted provider CDN and persist it to `store`, returning the
 * public CDN URL (or null on any failure — never throws, so a resolve job is never blocked).
 *
 * SECURITY: `sourceUrl` is attacker-influenced (it ultimately derives from records on the
 * network), so it is gated through the @onrepeat/core allowlist before any fetch — this is an
 * SSRF guard, same posture as the OG-image route. Bytes are content-addressed (sha256) so
 * identical art across tracks dedupes and re-runs are idempotent.
 */
export async function persistArtwork(
  sourceUrl: string,
  store: ArtworkStore,
  opts: PersistOptions = {},
): Promise<string | null> {
  if (!isTrustedArtworkUrl(sourceUrl)) return null
  const fetchFn = opts.fetchFn ?? fetch
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let res: Response
  try {
    res = await fetchFn(sourceUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return null
  }
  if (!res.ok) return null

  const contentType = ((res.headers.get('content-type') ?? '').split(';')[0] ?? '')
    .trim()
    .toLowerCase()
  if (!isImageContentType(contentType)) return null

  let bytes: Uint8Array | null
  try {
    bytes = await readBytesCapped(res, maxBytes)
  } catch {
    return null
  }
  if (!bytes || bytes.byteLength === 0) return null

  const hash = createHash('sha256').update(bytes).digest('hex')
  const key = `art/${hash}.${extFromContentType(contentType)}`
  try {
    if (!(await store.has(key))) await store.put(key, bytes, contentType)
    return store.urlForKey(key)
  } catch {
    return null
  }
}
