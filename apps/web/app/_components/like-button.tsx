'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { likeJamAction, unlikeJamAction } from '../actions'
import { useLikeSync } from './liked-by'
import { useToast } from './ui/toast'

export function LikeButton({
  jamUri,
  jamCid,
  initialCount,
  initialLiked,
  loggedIn,
}: {
  jamUri: string
  jamCid: string
  initialCount: number
  initialLiked: boolean
  loggedIn: boolean
}) {
  const [base, setBase] = useState({ liked: initialLiked, count: initialCount })
  const [likeUri, setLikeUri] = useState<string | undefined>()
  const [optimistic, setOptimistic] = useOptimistic(base)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  // Mirrors the like state to the "Liked by" row when one is present (detail page).
  const sync = useLikeSync()

  function toggle() {
    if (!loggedIn) {
      window.location.href = '/login'
      return
    }
    const next = {
      liked: !base.liked,
      count: base.count + (base.liked ? -1 : 1),
    }
    // Outside the transition: state set inside an async transition only commits once
    // the action settles, which made the liked-by row lag the click by the round-trip.
    // An urgent update here repaints it immediately (reverted below on failure).
    sync?.setLiked(next.liked)
    startTransition(async () => {
      setOptimistic(next)
      if (next.liked) {
        const res = await likeJamAction({ uri: jamUri, cid: jamCid })
        if (res.ok) {
          setLikeUri(res.likeUri)
          setBase(next)
        } else if (res.error === 'session-expired') {
          window.location.href = '/login?expired=1'
        } else {
          sync?.setLiked(base.liked)
          toast({ title: "Couldn't update like", variant: 'error' })
        }
      } else {
        const res = await unlikeJamAction(jamUri, likeUri)
        if (res.ok) {
          setLikeUri(undefined)
          setBase(next)
        } else if (res.error === 'session-expired') {
          window.location.href = '/login?expired=1'
        } else {
          sync?.setLiked(base.liked)
          toast({ title: "Couldn't update like", variant: 'error' })
        }
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      className={`inline-flex cursor-pointer items-center gap-1 ${optimistic.liked ? 'text-accent' : 'hover:text-accent'}`}
      aria-pressed={optimistic.liked}
      aria-label={optimistic.liked ? 'Unlike' : 'Like'}
    >
      <Heart
        size={16}
        fill={optimistic.liked ? 'currentColor' : 'none'}
        aria-hidden
      />
      {optimistic.count}
    </button>
  )
}
