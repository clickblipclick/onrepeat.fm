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
