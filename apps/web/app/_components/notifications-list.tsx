'use client'

import { Heart, Repeat2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { markNotificationsSeenAction } from '@/app/actions'
import type { HydratedNotification } from '@/lib/appview'
import { rkeyFromUri } from '@/lib/at-uri'

import { authorName, Avatar } from './avatar'
import { EmptyState } from './empty-state'
import { LoadMoreButton } from './load-more-button'
import { RelativeTime } from './relative-time'

/**
 * The notifications page body. Items live in client state seeded from the
 * server-rendered first page: on mount we advance the read watermark and
 * router.refresh() so the (server-rendered) bell badge clears, and holding the
 * items in state keeps the "new" dots visible through that refresh instead of
 * having them vanish while the viewer is looking at them.
 */
export function NotificationsList({
  initial,
  initialCursor,
}: {
  initial: HydratedNotification[]
  initialCursor?: string
}) {
  const [items, setItems] = useState(initial)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const router = useRouter()

  const marked = useRef(false)
  useEffect(() => {
    if (marked.current) return
    marked.current = true
    void markNotificationsSeenAction().then(() => router.refresh())
  }, [router])

  async function more() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(
        `/api/notifications?cursor=${encodeURIComponent(cursor!)}`,
      )
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as {
        notifications?: HydratedNotification[]
        cursor?: string
      }
      setItems((prev) => [...prev, ...(data.notifications ?? [])])
      setCursor(data.cursor)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0)
    return (
      <EmptyState>
        Nothing yet. When someone likes or reposts your tracks, or follows you,
        it shows up here.
      </EmptyState>
    )

  return (
    <div className="flex flex-col gap-2">
      {items.map((n) => (
        <NotificationRow key={n.recordUri} n={n} />
      ))}
      {cursor && (
        <LoadMoreButton onClick={more} loading={loading} error={error} />
      )}
    </div>
  )
}

function NotificationRow({ n }: { n: HydratedNotification }) {
  const profileHref = `/profile/${encodeURIComponent(n.actor.handle ?? n.actor.did)}`
  // The subject is the viewer's own jam; /profile accepts a DID, so no handle
  // lookup is needed for the permalink.
  const jamHref = n.jam
    ? `/profile/${encodeURIComponent(n.jam.authorDid)}/jam/${rkeyFromUri(n.jam.uri)}`
    : null
  const Icon =
    n.type === 'like' ? Heart : n.type === 'rejam' ? Repeat2 : UserPlus
  const verb =
    n.type === 'like'
      ? 'liked your track'
      : n.type === 'rejam'
        ? 'reposted your track'
        : 'followed you'
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm">
      <Link
        href={profileHref}
        aria-label={authorName(n.actor)}
        className="shrink-0 hover:opacity-90"
      >
        <Avatar author={n.actor} size={28} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate">
            <Link href={profileHref} className="font-bold hover:underline">
              {authorName(n.actor)}
            </Link>{' '}
            {verb}
          </span>
          {!n.seen && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-accent"
              aria-label="new"
            />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <Icon size={13} className="shrink-0" aria-hidden />
          {n.type !== 'follow' &&
            (n.jam && jamHref ? (
              <Link
                href={jamHref}
                className="min-w-0 truncate hover:text-accent"
              >
                {n.jam.title} · {n.jam.artist}
              </Link>
            ) : (
              <span>a track that has since been deleted</span>
            ))}
        </div>
      </div>
      <RelativeTime
        iso={n.createdAt}
        className="shrink-0 text-xs whitespace-nowrap text-muted"
      />
    </div>
  )
}
