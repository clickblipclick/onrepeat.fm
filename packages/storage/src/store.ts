import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

/**
 * A content-addressed blob store for cover art. Implementations are swappable
 * (R2 today; Railway volume / S3 later) — callers depend only on this interface.
 */
export interface ArtworkStore {
  /** True iff an object already exists at `key` (HEAD). Lets persistArtwork skip re-upload. */
  has(key: string): Promise<boolean>
  /** Upload `bytes` at `key` with the given content type. Idempotent on `key`. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  /** The public CDN URL that serves `key`. */
  urlForKey(key: string): string
}

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  /** Public CDN base, e.g. https://art.onrepeat.fm or the *.r2.dev URL. */
  publicBaseUrl: string
}

/** Join a CDN base and an object key with exactly one slash. */
export function publicUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, '')}/${key}`
}

/** An ArtworkStore backed by a Cloudflare R2 bucket (S3-compatible API). */
export function createR2Store(cfg: R2Config): ArtworkStore {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })
  return {
    async has(key) {
      try {
        await client.send(
          new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }),
        )
        return true
      } catch {
        return false
      }
    },
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          // Content-addressed keys never change → cache forever at the edge.
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      )
    },
    urlForKey(key) {
      return publicUrl(cfg.publicBaseUrl, key)
    },
  }
}
