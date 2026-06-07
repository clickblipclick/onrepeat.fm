'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from '@floating-ui/react'
import { MoreHorizontal, Trash2, LoaderCircle } from 'lucide-react'
import { deleteJamAction } from '../actions'
import { useConfirm } from './ui/confirm'
import { useToast } from './ui/toast'

/** Overflow (⋯) menu shown on a jam the viewer owns. Currently just Delete; the menu
 *  shell is here so future owner-only actions slot in. Positioned with Floating UI and
 *  rendered in a portal so it escapes the card's `overflow-hidden`. After deleting:
 *  `redirectTo` navigates away (the detail page, whose jam would 404 on refresh);
 *  otherwise the current page refreshes so the card drops out of the list. */
export function JamMenu({
  jamUri,
  redirectTo,
  className,
}: {
  jamUri: string
  redirectTo?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { confirm } = useConfirm()
  const { toast } = useToast()

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'menu' })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ])

  async function del() {
    setOpen(false)
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
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label="Jam options"
        disabled={pending}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-accent disabled:opacity-50 ${className ?? ''}`}
        {...getReferenceProps()}
      >
        {pending ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden />
        ) : (
          <MoreHorizontal size={18} aria-hidden />
        )}
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className="z-50 min-w-40 overflow-hidden rounded-md border border-border bg-surface py-1 text-sm shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={del}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-700 hover:bg-bg"
              >
                <Trash2 size={16} aria-hidden />
                Delete jam
              </button>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
