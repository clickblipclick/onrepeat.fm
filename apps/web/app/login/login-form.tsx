'use client'

import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from '@floating-ui/react'
import { useEffect, useRef, useState } from 'react'

import { buttonClassName } from '../../lib/button-variants'
import { inputClassName } from '../../lib/input-variants'
import type { TypeaheadActor } from '../../lib/typeahead'

const inputCls = inputClassName('w-full')

/** Sign-in handle field with grain-style account autocomplete. Renders a real
 *  <form action="/oauth/login" method="post"> so the server-side OAuth flow is untouched
 *  and it degrades to a plain handle field without JS. Suggestions come from /api/typeahead
 *  (debounced, >= 2 chars). Picking a suggestion fills the handle and submits immediately. */
export function LoginForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [handle, setHandle] = useState('')
  const [results, setResults] = useState<TypeaheadActor[]>([])
  // Set together with the picked handle; an effect submits once the input value reflects it
  // (a synchronous requestSubmit() would read the pre-update controlled value).
  const [pendingSubmit, setPendingSubmit] = useState(false)
  const seq = useRef(0)

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const listRef = useRef<Array<HTMLElement | null>>([])

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange(next) {
      setOpen(next)
      // Esc / outside-click: drop stale results AND bump seq so an in-flight fetch can't
      // repopulate (and reopen) the list.
      if (!next) {
        seq.current++
        setResults([])
      }
    },
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, elements, availableHeight }) {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
            maxHeight: `${Math.min(availableHeight, 288)}px`,
          })
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  })
  const role = useRole(context, { role: 'listbox' })
  const dismiss = useDismiss(context)
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    virtual: true,
    loop: true,
  })
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [role, dismiss, listNav],
  )

  // Debounced typeahead (~200ms, matching grain). seq guards against out-of-order responses.
  useEffect(() => {
    const q = handle.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const id = setTimeout(async () => {
      const mine = ++seq.current
      try {
        const res = await fetch(`/api/typeahead?q=${encodeURIComponent(q)}`)
        const data = (await res.json()) as { actors: TypeaheadActor[] }
        if (mine === seq.current) setResults(data.actors)
      } catch {
        if (mine === seq.current) setResults([])
      }
    }, 200)
    return () => clearTimeout(id)
  }, [handle])

  // Open when results arrive (pre-highlight the first), close when empty. Trim listRef so a
  // shrinking result set can't leave stale option nodes for arrow-key navigation.
  useEffect(() => {
    listRef.current.length = results.length
    setOpen(results.length > 0)
    setActiveIndex(results.length > 0 ? 0 : null)
  }, [results])

  // B1: once the controlled input reflects the picked handle, submit into OAuth.
  useEffect(() => {
    if (!pendingSubmit) return
    setPendingSubmit(false)
    formRef.current?.requestSubmit()
  }, [pendingSubmit])

  const pick = (actor: TypeaheadActor) => {
    setHandle(actor.handle)
    setResults([])
    setOpen(false)
    setActiveIndex(null)
    setPendingSubmit(true)
  }

  return (
    <form ref={formRef} action="/oauth/login" method="post">
      <input
        ref={refs.setReference}
        name="handle"
        value={handle}
        placeholder="you.bsky.social"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="username"
        required
        className={inputCls}
        role="combobox"
        aria-autocomplete="list"
        aria-label="Bluesky handle"
        {...getReferenceProps({
          onChange: (e) =>
            setHandle((e.currentTarget as HTMLInputElement).value),
          onKeyDown: (e) => {
            if (
              e.key === 'Enter' &&
              open &&
              activeIndex != null &&
              results[activeIndex]
            ) {
              e.preventDefault()
              pick(results[activeIndex])
            }
          },
        })}
      />
      <button
        type="submit"
        className={buttonClassName({ className: 'mt-3 w-full' })}
      >
        Sign in
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 overflow-y-auto rounded-md border border-border bg-surface shadow-lg"
          >
            {results.map((r, i) => (
              <button
                key={r.handle}
                ref={(node) => {
                  listRef.current[i] = node
                }}
                type="button"
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                  activeIndex === i ? 'bg-bg' : ''
                }`}
                {...getItemProps({
                  active: activeIndex === i,
                  selected: activeIndex === i,
                  onClick: () => pick(r),
                })}
              >
                {r.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.avatar}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-full bg-border" />
                )}
                <span className="min-w-0">
                  {r.displayName && (
                    <span className="block truncate text-sm font-bold">
                      {r.displayName}
                    </span>
                  )}
                  <span className="block truncate text-xs text-muted">
                    @{r.handle}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </FloatingPortal>
      )}
    </form>
  )
}
