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

/** The slice of the S3 client the store uses; injectable for tests. */
export interface ObjectClient {
  send(command: HeadObjectCommand | PutObjectCommand): Promise<unknown>
}

/** The SDK surfaces a HEAD 404 as name 'NotFound'; keep the status check as a fallback. */
function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404
}

/** An ArtworkStore backed by a Cloudflare R2 bucket (S3-compatible API). */
export function createR2Store(
  cfg: R2Config,
  client: ObjectClient = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  }),
): ArtworkStore {
  return {
    async has(key) {
      try {
        await client.send(
          new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }),
        )
        return true
      } catch (err) {
        // Only a definitive 404 means "missing" — an auth/config/network failure
        // must surface, or a misconfigured store reads as "object not there" and
        // the real cause never shows up anywhere.
        if (isNotFound(err)) return false
        throw err
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
