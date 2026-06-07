'use client'

import { useRef, useState, useTransition } from 'react'
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
  useListNavigation,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from '@floating-ui/react'
import { MoreHorizontal, Trash2, LoaderCircle } from 'lucide-react'
import { deleteJamAction } from '../actions'
import { useConfirm } from './ui/confirm'
import { useToast } from './ui/toast'

interface MenuItem {
  label: string
  icon: React.ReactNode
  onSelect: () => void
  danger?: boolean
}

/** Overflow (⋯) menu shown on a jam the viewer owns. Currently just Delete; items are a
 *  list so more owner-only actions slot in while keeping the role="menu" keyboard contract
 *  (arrow/Home/End navigation via useListNavigation). Positioned with Floating UI and
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { confirm } = useConfirm()
  const { toast } = useToast()
  const listRef = useRef<Array<HTMLElement | null>>([])

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
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
  })
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [click, dismiss, role, listNav],
  )

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

  const items: MenuItem[] = [
    {
      label: 'Delete jam',
      icon: <Trash2 size={16} aria-hidden />,
      onSelect: del,
      danger: true,
    },
  ]

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
              {items.map((item, i) => (
                <button
                  key={item.label}
                  ref={(node) => {
                    listRef.current[i] = node
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={activeIndex === i ? 0 : -1}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left outline-none hover:bg-bg focus:bg-bg ${item.danger ? 'text-red-700' : ''}`}
                  {...getItemProps({ onClick: item.onSelect })}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
