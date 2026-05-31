import type { Author } from '@onrepeat/appview'

/** A square avatar; falls back to an accent block when there's no image. */
export function Avatar({ author, size = 24 }: { author: Author; size?: number }) {
  const style = { width: size, height: size }
  if (author.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={author.avatar} alt="" style={style} className="rounded object-cover" />
  }
  return <span style={style} className="inline-block rounded bg-accent" aria-hidden />
}

/** The best human label we have: display name, then handle, then a shortened DID. */
export function authorName(author: Author): string {
  if (author.displayName) return author.displayName
  if (author.handle) return author.handle
  return author.did.length > 20 ? author.did.slice(0, 20) + '…' : author.did
}
