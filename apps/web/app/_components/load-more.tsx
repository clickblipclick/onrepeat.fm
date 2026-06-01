'use client'

import { useState } from 'react'
import type { HydratedJamView } from '@onrepeat/appview'
import { JamCard } from './jam-card'

/** Appends pages fetched from an /api endpoint that returns { [itemsKey], cursor }. */
export function LoadMore({
  endpoint,
  itemsKey,
  initialCursor,
}: {
  endpoint: string
  itemsKey: 'feed' | 'jams'
  initialCursor?: string
}) {
  const [items, setItems] = useState<HydratedJamView[]>([])
  const [cursor, setCursor] = useState<string | undefined>(initialCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  if (!cursor && items.length === 0) return null

  async function more() {
    setLoading(true)
    setError(false)
    try {
      const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor!)}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as Record<string, HydratedJamView[] | string | undefined>
      setItems((prev) => [...prev, ...((data[itemsKey] as HydratedJamView[]) ?? [])])
      setCursor(data.cursor as string | undefined)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {items.map((jam) => (
        <JamCard key={jam.uri} jam={jam} />
      ))}
      {cursor && (
        <button type="button" onClick={more} disabled={loading} className="w-full rounded border border-dashed border-border py-2 text-sm text-muted hover:text-accent">
          {loading ? 'loading…' : error ? "couldn't load — retry" : 'load more ↓'}
        </button>
      )}
    </>
  )
}
