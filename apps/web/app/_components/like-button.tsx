'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { likeJamAction, unlikeJamAction } from '../actions'

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

  function toggle() {
    if (!loggedIn) {
      window.location.href = '/'
      return
    }
    const next = { liked: !base.liked, count: base.count + (base.liked ? -1 : 1) }
    startTransition(async () => {
      setOptimistic(next)
      if (next.liked) {
        const res = await likeJamAction({ uri: jamUri, cid: jamCid })
        if (res.ok) {
          setLikeUri(res.likeUri)
          setBase(next)
        }
      } else {
        const res = await unlikeJamAction(jamUri, likeUri)
        if (res.ok) {
          setLikeUri(undefined)
          setBase(next)
        }
      }
    })
  }

  return (
    <button type="button" onClick={toggle} disabled={isPending} className={optimistic.liked ? 'text-accent' : 'hover:text-accent'} aria-pressed={optimistic.liked}>
      ♥ {optimistic.count}
    </button>
  )
}
