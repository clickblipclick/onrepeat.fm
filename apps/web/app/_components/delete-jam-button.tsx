'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { deleteJamAction } from '../actions'

export function DeleteJamButton({
  jamUri,
  profileHandle,
}: {
  jamUri: string
  profileHandle: string
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function del() {
    if (!window.confirm("Delete this jam permanently? This can't be undone."))
      return
    startTransition(async () => {
      const res = await deleteJamAction(jamUri)
      if (res.ok) {
        router.push(`/profile/${encodeURIComponent(profileHandle)}`)
      } else if (res.error === 'session-expired') {
        window.location.href = '/login?expired=1'
      }
    })
  }

  return (
    <button
      type="button"
      onClick={del}
      disabled={pending}
      className="inline-flex items-center gap-1 hover:text-accent disabled:text-muted"
    >
      {pending ? (
        <>
          <LoaderCircle size={16} className="animate-spin" aria-hidden />
          deleting
        </>
      ) : (
        <>
          <Trash2 size={16} aria-hidden />
          delete
        </>
      )}
    </button>
  )
}
