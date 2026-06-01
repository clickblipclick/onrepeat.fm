'use client'

import { useState, useTransition } from 'react'
import { reJamAction, type ReJamArgs } from '../actions'

export function ReJamButton({ jam, loggedIn }: { jam: ReJamArgs & { authorName: string }; loggedIn: boolean }) {
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function rejam() {
    if (!loggedIn) {
      window.location.href = '/'
      return
    }
    if (!window.confirm(`Re-jam this as your current jam? It'll replace your current jam, crediting @${jam.authorName}.`)) return
    startTransition(async () => {
      const { authorName: _n, ...args } = jam
      const res = await reJamAction(args)
      if (res.ok) setDone(true)
    })
  }

  return (
    <button type="button" onClick={rejam} disabled={pending || done} className="hover:text-accent disabled:text-muted">
      {done ? '✓ re-jammed' : pending ? '…' : '⟳ re-jam'}
    </button>
  )
}
