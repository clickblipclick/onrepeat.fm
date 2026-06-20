'use client'

import { LoaderCircle, MoreHorizontal, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { deleteJamAction } from '../actions'
import { useConfirm } from './ui/confirm'
import { Menu } from './ui/menu'
import { useToast } from './ui/toast'

/** Overflow (⋯) menu shown on a jam the viewer owns — currently just Delete. Built on the
 *  shared <Menu>. After deleting: `redirectTo` navigates away (the detail page, whose jam
 *  would 404 on refresh); otherwise the page refreshes so the card drops out of the list. */
export function JamMenu({
  jamUri,
  redirectTo,
  className,
}: {
  jamUri: string
  redirectTo?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { confirm } = useConfirm()
  const { toast } = useToast()

  async function del() {
    const ok = await confirm({
      title: 'Delete this jam?',
      description: "This permanently removes it and can't be undone.",
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteJamAction(jamUri)
      if (res.ok) {
        if (redirectTo) router.push(redirectTo)
        else router.refresh()
      } else if (res.error === 'session-expired') {
        window.location.href = '/login?expired=1'
      } else {
        toast({ title: "Couldn't delete jam", variant: 'error' })
      }
    })
  }

  return (
    <Menu
      label="Jam options"
      disabled={pending}
      triggerClassName={`inline-flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-50 ${className ?? ''}`}
      items={[
        {
          label: 'Delete jam',
          icon: <Trash2 size={16} aria-hidden />,
          onSelect: del,
          danger: true,
        },
      ]}
    >
      {pending ? (
        <LoaderCircle size={16} className="animate-spin" aria-hidden />
      ) : (
        <MoreHorizontal size={18} aria-hidden />
      )}
    </Menu>
  )
}
