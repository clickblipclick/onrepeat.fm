'use client'

import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  type Placement,
} from '@floating-ui/react'
import { useRef, useState } from 'react'

export interface MenuItem {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  danger?: boolean
  /** Accent-colored item for a highlighted entry (e.g. unread notifications). */
  accent?: boolean
  /** Small accent pill rendered at the item's right edge (e.g. an unread count). */
  badge?: string
  /** Draw a separator under this item (ignored on the last item). */
  dividerAfter?: boolean
  /** Radio-style menus (e.g. a service picker): marks the active item. When any item
   *  in the menu defines this, items render as menuitemradio with aria-checked. */
  selected?: boolean
}

/** Accessible popover menu (Floating UI): a role=menu with roving focus + arrow/Home/End
 *  navigation, Esc/outside-click dismiss, portaled so it escapes `overflow-hidden` ancestors.
 *  The trigger is a button wrapping `children` (style via `triggerClassName`). Selecting an
 *  item closes the menu, then runs its `onSelect`. */
export function Menu({
  label,
  children,
  triggerClassName,
  disabled = false,
  items,
  placement = 'bottom-end',
}: {
  label: string
  children: React.ReactNode
  triggerClassName?: string
  disabled?: boolean
  items: MenuItem[]
  placement?: Placement
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const listRef = useRef<Array<HTMLElement | null>>([])

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
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

  // A menu where any item declares `selected` is a radio-style picker.
  const radio = items.some((item) => item.selected !== undefined)

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={label}
        disabled={disabled}
        className={triggerClassName}
        {...getReferenceProps()}
      >
        {children}
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
                <div key={item.label}>
                  <button
                    ref={(node) => {
                      listRef.current[i] = node
                    }}
                    type="button"
                    role={radio ? 'menuitemradio' : 'menuitem'}
                    aria-checked={radio ? (item.selected ?? false) : undefined}
                    tabIndex={activeIndex === i ? 0 : -1}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left outline-none hover:bg-bg focus:bg-bg ${item.danger ? 'text-red-700' : item.accent ? 'font-bold text-accent' : ''}`}
                    {...getItemProps({
                      onClick() {
                        setOpen(false)
                        item.onSelect()
                      },
                    })}
                  >
                    {radio && (
                      <span
                        aria-hidden
                        className="w-3 text-center text-xs leading-none"
                      >
                        {item.selected ? '●' : ''}
                      </span>
                    )}
                    {item.icon}
                    {item.label}
                    {item.badge && (
                      <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-bold text-on-accent">
                        {item.badge}
                      </span>
                    )}
                  </button>
                  {item.dividerAfter && i < items.length - 1 && (
                    <div aria-hidden className="my-1 border-t border-border" />
                  )}
                </div>
              ))}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
