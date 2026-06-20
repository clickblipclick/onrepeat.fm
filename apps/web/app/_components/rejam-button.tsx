'use client'

import { Check, LoaderCircle, Repeat2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { reJamAction, type ReJamArgs } from '../actions'
import { useConfirm } from './ui/confirm'
import { useToast } from './ui/toast'

export function ReJamButton({
  jam,
  loggedIn,
}: {
  jam: ReJamArgs & { authorName: string }
  loggedIn: boolean
}) {
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()
  const { confirm } = useConfirm()
  const { toast } = useToast()

  async function rejam() {
    if (!loggedIn) {
      window.location.href = '/login'
      return
    }
    const ok = await confirm({
      title: 'Repost this track?',
      description: `It'll replace what you've got on repeat, crediting @${jam.authorName}.`,
      confirmText: 'Repost',
    })
    if (!ok) return
    startTransition(async () => {
      const { authorName: _n, ...args } = jam
      const res = await reJamAction(args)
      if (res.ok) setDone(true)
      else if (res.error === 'session-expired')
        window.location.href = '/login?expired=1'
      else toast({ title: "Couldn't repost", variant: 'error' })
    })
  }

  return (
    <button
      type="button"
      onClick={rejam}
      disabled={pending || done}
      className="inline-flex cursor-pointer items-center gap-1 hover:text-accent disabled:text-muted"
    >
      {done ? (
        <>
          <Check size={16} aria-hidden />
          reposted
        </>
      ) : pending ? (
        <>
          <LoaderCircle size={16} className="animate-spin" aria-hidden />
          repost
        </>
      ) : (
        <>
          <Repeat2 size={16} aria-hidden />
          repost
        </>
      )}
    </button>
  )
}
