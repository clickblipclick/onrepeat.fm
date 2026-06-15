'use client'

import { useEffect, useRef, useState } from 'react'
import {
  useFloating,
  offset,
  flip,
  shift,
  size,
  autoUpdate,
  useRole,
  useDismiss,
  useListNavigation,
  useInteractions,
  FloatingPortal,
} from '@floating-ui/react'
import type { TrackCandidate } from '@onrepeat/music'
import { deriveTrackAction } from '../actions'
import { inputClassName } from '../../lib/input-variants'
import { VinylPlaceholder } from './vinyl-placeholder'

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim())
const inputCls = inputClassName('w-full')
// Inputs that take part in client-side validation: :user-invalid reddens the border only
// after the user has interacted and left the field invalid (never flags untouched fields).
const validatedInputCls = inputClassName('w-full user-invalid:border-red-600')

/** Smart track input: type to search (iTunes via /api/track-search) or paste a link
 *  (oEmbed/iTunes lookup via deriveTrackAction). Renders the title/artist/sourceUrl/artworkUrl
 *  form fields so the surrounding <form> submits them; manual entry is the failure fallback.
 *  Search results render as a Floating UI combobox listbox (virtual focus: the cursor stays
 *  in the input; ↑/↓ move the active option, Enter selects, Esc/outside dismisses). */
export function TrackPicker({
  onContentChange,
  onReadyChange,
}: {
  /** Fires whenever the picker gains/loses input: a track is selected, or the
   *  search/URL field is non-empty. Lets the parent form drive a dirty guard. */
  onContentChange?: (hasContent: boolean) => void
  /** Fires when the picker becomes submittable (a track is selected, or the user is in
   *  manual entry where the required fields take over). Lets the form gate its submit. */
  onReadyChange?: (ready: boolean) => void
} = {}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TrackCandidate[]>([])
  const [selected, setSelected] = useState<TrackCandidate | null>(null)
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState(false)
  // Autofilled title/artist show as read-only text (keeps the canonical metadata that
  // drives dedup/resolution); an explicit "edit" reveals editable inputs.
  const [editing, setEditing] = useState(false)
  const seq = useRef(0)
  // Guards auto-derive: the last URL we kicked off, so each link is processed once.
  const lastDerived = useRef('')

  // Combobox popover (Floating UI). `open` tracks the results list; useListNavigation runs
  // in virtual mode so focus never leaves the search input.
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const listRef = useRef<Array<HTMLElement | null>>([])

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange(next) {
      setOpen(next)
      // Esc / outside-click closes the popover; drop the stale results AND bump the
      // request seq so any in-flight search can't repopulate (and reopen) it.
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

  // Surface "has the user put anything in?" to the parent: a selected track, or any
  // non-empty search/URL text (also covers manual-entry mode, which keeps the URL in query).
  useEffect(() => {
    onContentChange?.(selected != null || query.trim().length > 0)
  }, [selected, query, onContentChange])

  // A track is submittable once it's selected, or once we're in manual entry (where the
  // required sourceUrl/title/artist inputs enforce their own validation on submit).
  useEffect(() => {
    onReadyChange?.(selected != null || manual)
  }, [selected, manual, onReadyChange])

  // Resolve the nearest <dialog> once mounted so the listbox can portal into the modal's
  // top layer (null on the full /post page → a body portal that escapes overflow clipping).
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setPortalRoot(
      (refs.reference.current as HTMLElement | null)?.closest('dialog') ?? null,
    )
    // refs is stable; run once after the input mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Open the combobox when results arrive (and pre-highlight the first), close when empty.
  // Trim listRef so a shrinking result set can't leave stale (unmounted) option nodes that
  // arrow-key navigation would land on.
  useEffect(() => {
    listRef.current.length = results.length
    setOpen(results.length > 0)
    setActiveIndex(results.length > 0 ? 0 : null)
  }, [results])

  useEffect(() => {
    if (selected || isUrl(query) || query.trim().length < 2) {
      setResults([])
      return
    }
    const id = setTimeout(async () => {
      const mine = ++seq.current
      try {
        const res = await fetch(
          `/api/track-search?q=${encodeURIComponent(query.trim())}`,
        )
        const data = (await res.json()) as { results: TrackCandidate[] }
        if (mine === seq.current) setResults(data.results)
      } catch {
        if (mine === seq.current) setResults([])
      }
    }, 300)
    return () => clearTimeout(id)
  }, [query, selected])

  // Auto-process a recognized link the moment it's pasted/typed (debounced) — no extra
  // click. Each distinct URL is derived once; clearing the field re-arms it. A miss
  // (unknown provider / failed lookup) drops to manual entry, keeping the URL.
  useEffect(() => {
    const url = query.trim()
    if (
      selected ||
      manual ||
      busy ||
      !isUrl(url) ||
      url === lastDerived.current
    )
      return
    const id = setTimeout(async () => {
      lastDerived.current = url
      setBusy(true)
      const c = await deriveTrackAction(url)
      setBusy(false)
      if (c) {
        // Inline rather than calling pick() so this effect depends only on stable setters.
        setSelected(c)
        setResults([])
        setOpen(false)
        setActiveIndex(null)
        setEditing(false)
      } else {
        setManual(true)
      }
    }, 500)
    return () => clearTimeout(id)
  }, [query, selected, manual, busy])

  // Commit a chosen candidate (from a search result or a derived link).
  const pick = (candidate: TrackCandidate) => {
    setSelected(candidate)
    setResults([])
    setOpen(false)
    setActiveIndex(null)
    setEditing(false)
  }

  if (selected) {
    return (
      <div
        key={selected.sourceUrl}
        className="rounded-md border border-border bg-surface p-4"
      >
        <div className="flex items-center gap-4">
          {selected.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.artworkUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded object-cover"
            />
          ) : (
            <VinylPlaceholder className="h-20 w-20 rounded" />
          )}
          <div className="min-w-0 flex-1">
            <input
              name="title"
              defaultValue={selected.title}
              readOnly={!editing}
              required
              aria-label="Song title"
              className={
                editing
                  ? `${validatedInputCls} mb-1`
                  : 'w-full truncate bg-transparent font-bold focus:outline-none'
              }
            />
            <input
              name="artist"
              defaultValue={selected.artist}
              readOnly={!editing}
              required
              aria-label="Artist"
              className={
                editing
                  ? validatedInputCls
                  : 'w-full truncate bg-transparent text-sm text-muted focus:outline-none'
              }
            />
          </div>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
            className="shrink-0 self-start text-xs text-muted hover:text-accent"
          >
            {editing ? 'done' : 'edit'}
          </button>
        </div>
        <input type="hidden" name="sourceUrl" value={selected.sourceUrl} />
        <input
          type="hidden"
          name="artworkUrl"
          value={selected.artworkUrl ?? ''}
        />
        {selected.isLikelyMusic === false && (
          <p className="mt-2 text-xs text-amber-700" role="status">
            ⚠ This doesn’t look like music — you can post it anyway, or{' '}
            <button
              type="button"
              onClick={() => {
                setSelected(null)
                setQuery('')
                setEditing(false)
                lastDerived.current = ''
              }}
              className="underline hover:text-accent"
            >
              pick another
            </button>
            .
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setSelected(null)
            setQuery('')
            setEditing(false)
            lastDerived.current = ''
          }}
          className="mt-2 text-xs text-muted hover:text-accent"
        >
          change track
        </button>
      </div>
    )
  }

  if (manual) {
    return (
      // Distinct key so React remounts (rather than reusing the search input's DOM node,
      // which would flip it from controlled value={query} to uncontrolled defaultValue).
      <div key="manual" className="flex flex-col gap-2">
        <input
          type="url"
          name="sourceUrl"
          defaultValue={isUrl(query) ? query.trim() : ''}
          placeholder="https://… (music link)"
          aria-label="Song URL"
          required
          className={validatedInputCls}
        />
        <input
          name="title"
          placeholder="Song title"
          aria-label="Song title"
          required
          className={validatedInputCls}
        />
        <input
          name="artist"
          placeholder="Artist"
          aria-label="Artist"
          required
          className={validatedInputCls}
        />
        <input type="hidden" name="artworkUrl" value="" />
        <button
          type="button"
          onClick={() => setManual(false)}
          className="self-start text-xs text-muted hover:text-accent"
        >
          back to search
        </button>
      </div>
    )
  }

  return (
    <div
      key="search"
      className="rounded-md border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-4">
        <VinylPlaceholder className="h-20 w-20 rounded" />
        <div className="min-w-0 flex-1">
          <input
            ref={refs.setReference}
            value={query}
            placeholder="Search a song, or paste a link…"
            aria-label="Search a song or paste a link"
            className={inputCls}
            {...getReferenceProps({
              onChange: (e) =>
                setQuery((e.currentTarget as HTMLInputElement).value),
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
            role="combobox"
            aria-autocomplete="list"
          />
          {isUrl(query) && (
            <p
              className="mt-2 text-sm text-muted"
              role="status"
              aria-live="polite"
            >
              Looking up link…
            </p>
          )}
        </div>
      </div>
      {open && (
        <FloatingPortal root={portalRoot}>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 overflow-y-auto rounded-md border border-border bg-surface shadow-lg"
          >
            {results.map((r, i) => (
              <button
                key={r.sourceUrl}
                ref={(node) => {
                  listRef.current[i] = node
                }}
                type="button"
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                  activeIndex === i ? 'bg-bg' : ''
                }`}
                {...getItemProps({
                  // active/selected let Floating UI assign the active option's id and
                  // aria-selected, and wire aria-activedescendant on the input (role="option"
                  // comes from useRole's listbox role).
                  active: activeIndex === i,
                  selected: activeIndex === i,
                  onClick: () => pick(r),
                })}
              >
                {r.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.artworkUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <VinylPlaceholder className="h-10 w-10 rounded" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">
                    {r.title}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {r.artist}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </FloatingPortal>
      )}
      <button
        type="button"
        onClick={() => setManual(true)}
        className="mt-3 text-xs text-muted hover:text-accent"
      >
        enter manually
      </button>
    </div>
  )
}
