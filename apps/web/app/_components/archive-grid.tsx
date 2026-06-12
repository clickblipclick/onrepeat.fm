'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { HydratedJamView } from '@onrepeat/appview'
import { rkeyFromUri } from '../../lib/at-uri'
import { LoadMoreButton } from './load-more-button'

/**
 * A profile's archive as a 4-col artwork grid with a "load more" button. Keeps every tile in
 * one grid (unlike the feed's LoadMore, which appends sibling cards) so the layout stays
 * continuous as pages are appended. Pages come from /api/actor/<did>?cursor=… → { jams, cursor }.
 */
export function ArchiveGrid({
  did,
  handle,
  initial,
  initialCursor,
}: {
  did: string
  handle: string
  initial: HydratedJamView[]
  initialCursor?: string
}) {
  const [items, setItems] = useState<HydratedJamView[]>(initial)
  const [cursor, setCursor] = useState<string | undefined>(initialCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function more() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(
        `/api/actor/${encodeURIComponent(did)}?cursor=${encodeURIComponent(cursor!)}`,
      )
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as {
        jams?: HydratedJamView[]
        cursor?: string
      }
      setItems((prev) => [...prev, ...(data.jams ?? [])])
      setCursor(data.cursor)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {items.map((jam) => (
          <Link
            key={jam.uri}
            href={`/profile/${encodeURIComponent(handle)}/jam/${rkeyFromUri(jam.uri)}`}
            className="block aspect-square overflow-hidden rounded border border-border"
            title={`${jam.title} — ${jam.artist}`}
          >
            {jam.artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={jam.artworkUrl}
                alt={`${jam.title} by ${jam.artist}`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="accent-grid block h-full w-full" />
            )}
          </Link>
        ))}
      </div>
      {cursor && (
        <LoadMoreButton
          onClick={more}
          loading={loading}
          error={error}
          className="mt-2"
        />
      )}
    </>
  )
}
