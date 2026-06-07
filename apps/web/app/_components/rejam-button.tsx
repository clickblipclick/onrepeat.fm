'use client'

import { useState, useTransition } from 'react'
import { Check, LoaderCircle, Repeat2 } from 'lucide-react'
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
      title: 'Re-jam this track?',
      description: `It'll replace your current jam, crediting @${jam.authorName}.`,
      confirmText: 'Re-jam',
    })
    if (!ok) return
    startTransition(async () => {
      const { authorName: _n, ...args } = jam
      const res = await reJamAction(args)
      if (res.ok) setDone(true)
      else if (res.error === 'session-expired')
        window.location.href = '/login?expired=1'
      else toast({ title: "Couldn't re-jam", variant: 'error' })
    })
  }

  return (
    <button
      type="button"
      onClick={rejam}
      disabled={pending || done}
      className="inline-flex items-center gap-1 hover:text-accent disabled:text-muted"
    >
      {done ? (
        <>
          <Check size={16} aria-hidden />
          re-jammed
        </>
      ) : pending ? (
        <>
          <LoaderCircle size={16} className="animate-spin" aria-hidden />
          re-jam
        </>
      ) : (
        <>
          <Repeat2 size={16} aria-hidden />
          re-jam
        </>
      )}
    </button>
  )
}
