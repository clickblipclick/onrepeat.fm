'use client'

import { useOptimistic, useState, useTransition } from 'react'

import { buttonClassName } from '../../lib/button-variants'
import { followAction, unfollowAction } from '../actions'
import { useToast } from './ui/toast'

export function FollowButton({
  subjectDid,
  initialFollowing,
  loggedIn,
}: {
  subjectDid: string
  initialFollowing: boolean
  loggedIn: boolean
}) {
  const [base, setBase] = useState(initialFollowing)
  const [optimistic, setOptimistic] = useOptimistic(base)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function toggle() {
    if (!loggedIn) {
      window.location.href = '/login'
      return
    }
    const next = !base
    startTransition(async () => {
      setOptimistic(next)
      const res = next
        ? await followAction(subjectDid)
        : await unfollowAction(subjectDid)
      if (res.ok) {
        setBase(next)
      } else if (res.error === 'session-expired') {
        window.location.href = '/login?expired=1'
      } else {
        toast({ title: "Couldn't update follow", variant: 'error' })
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={optimistic}
      className={
        optimistic
          ? buttonClassName({ variant: 'secondary', size: 'sm' })
          : buttonClassName({ variant: 'primary', size: 'sm' })
      }
    >
      {optimistic ? 'Following' : 'Follow'}
    </button>
  )
}
