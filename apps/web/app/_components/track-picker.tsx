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

import { providerFromUrl } from '@onrepeat/core'
import type { TrackCandidate } from '@onrepeat/music'

import { inputClassName } from '../../lib/input-variants'
import { deriveTrackAction } from '../actions'
import { Button } from './ui/button'
import { VinylPlaceholder } from './vinyl-placeholder'

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim())
const inputCls = inputClassName('w-full')
// Inputs that take part in client-side validation: :user-invalid reddens the border only
// after the user has interacted and left the field invalid (never flags untouched fields).
const validatedInputCls = inputClassName('w-full user-invalid:border-red-600')

/** Smart track input: type to search (iTunes via /api/track-search) or paste a link
 *  (oEmbed/iTunes lookup via deriveTrackAction). Renders the title/artist/sourceUrl/artworkUrl
 *  form fields so the surrounding <form> submits them. Links that aren't recognized music
 *  hosts, or that can't be read, are rejected inline — the only commit paths are a picked
 *  search result or a successfully derived link.
 *  Search results render as a Floating UI combobox listbox (virtual focus: the cursor stays
 *  in the input; ↑/↓ move the active option, Enter selects, Esc/outside dismisses). */
export function TrackPicker({
  onContentChange,
}: {
  /** Fires whenever the picker gains/loses input: a track is selected, or the
   *  search/URL field is non-empty. Lets the parent form drive a dirty guard. */
  onContentChange?: (hasContent: boolean) => void
} = {}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TrackCandidate[]>([])
  const [selected, setSelected] = useState<TrackCandidate | null>(null)
  // Editable title/artist for the selected track, seeded from the candidate. Controlled so
  // edits survive the display⇄edit toggle and feed the form (hidden fields in display mode,
  // the editable inputs in edit mode).
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  // The single reject state: why the last pasted link wasn't accepted (null = no error).
  const [deriveError, setDeriveError] = useState<
    null | 'unknown-host' | 'transient' | 'unreadable'
  >(null)
  // Bumped by Retry to re-run derive for the same URL (refs alone don't re-fire effects).
  const [retryNonce, setRetryNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  // Autofilled title/artist show as read-only text (keeps the canonical metadata that
  // drives dedup/resolution); an explicit "edit" reveals editable inputs.
  const [editing, setEditing] = useState(false)
  const seq = useRef(0)
  // Guards auto-derive: the last URL we kicked off, so each link is processed once.
  const lastDerived = useRef('')
  // Latest field value, readable inside an in-flight derive's stale closure so a slow
  // result the user has since edited/cleared away from can be discarded.
  const latestQuery = useRef(query)
  latestQuery.current = query

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
  // non-empty search/URL text.
  useEffect(() => {
    onContentChange?.(selected != null || query.trim().length > 0)
  }, [selected, query, onContentChange])

  // The bare search field isn't a named/required input, so "no track chosen" can't be a
  // field constraint. Mark it invalid with a custom message while no track is committed, so
  // submitting surfaces that message and focuses the field — rather than disabling the submit
  // button (which gives no feedback). Cleared once a track is selected.
  useEffect(() => {
    const el = refs.reference.current as HTMLInputElement | null
    el?.setCustomValidity(selected ? '' : 'Pick a track to share.')
  }, [selected])

  // Resolve the nearest <dialog> once mounted so the listbox can portal into the modal's
  // top layer. Must be undefined (NOT null) when there's no dialog: FloatingPortal treats an
  // explicit root={null} as "no portal target" and renders nothing, whereas undefined falls
  // back to its default body portal — which is what the full /post page needs.
  const [portalRoot, setPortalRoot] = useState<HTMLElement | undefined>(
    undefined,
  )
  useEffect(() => {
    setPortalRoot(
      (refs.reference.current as HTMLElement | null)?.closest('dialog') ??
        undefined,
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
  // click. Unknown hosts are rejected client-side (no server round-trip). A supported
  // host that can't be read reports transient (retryable) or unreadable. Each distinct
  // URL is processed once; clearing the field or Retry re-arms it.
  useEffect(() => {
    const url = query.trim()
    if (selected || busy) return
    if (!isUrl(url)) {
      // Reset when the field isn't a link (typing a search, or cleared).
      setDeriveError(null)
      lastDerived.current = ''
      return
    }
    if (url === lastDerived.current) return
    // Allowlist gate, shared with the resolver: reject non-music hosts instantly.
    if (providerFromUrl(url) === null) {
      lastDerived.current = url
      setDeriveError('unknown-host')
      return
    }
    const id = setTimeout(async () => {
      lastDerived.current = url
      setDeriveError(null)
      setBusy(true)
      const r = await deriveTrackAction(url)
      setBusy(false)
      // Discard a slow result the user has moved on from (edited/cleared the field while
      // it was in flight) — otherwise it would hijack the form into the selected view.
      if (latestQuery.current.trim() !== url) return
      if (r.ok) {
        setSelected(r.candidate)
        setTitle(r.candidate.title)
        setArtist(r.candidate.artist)
        setResults([])
        setOpen(false)
        setActiveIndex(null)
        setEditing(false)
      } else {
        setDeriveError(r.reason)
      }
    }, 500)
    return () => clearTimeout(id)
    // `busy` is a dep so the in-flight guard above re-evaluates on each flip; the
    // `url === lastDerived.current` check makes the resulting re-runs no-ops.
  }, [query, selected, busy, retryNonce])

  // Commit a chosen candidate (from a search result or a derived link).
  const pick = (candidate: TrackCandidate) => {
    setSelected(candidate)
    setTitle(candidate.title)
    setArtist(candidate.artist)
    setResults([])
    setOpen(false)
    setActiveIndex(null)
    setEditing(false)
  }

  // Re-run derive for the same URL after a transient failure.
  const retry = () => {
    lastDerived.current = ''
    setDeriveError(null)
    setRetryNonce((n) => n + 1)
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
              className="h-32 w-32 shrink-0 rounded object-cover"
            />
          ) : (
            <VinylPlaceholder className="h-32 w-32 rounded" />
          )}
          <div className="min-w-0 flex-1">
            {editing ? (
              <>
                <input
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  aria-label="Song title"
                  className={`${validatedInputCls} mb-1`}
                />
                <input
                  name="artist"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  required
                  aria-label="Artist"
                  className={validatedInputCls}
                />
              </>
            ) : (
              <>
                {/* Display as wrapping text (an <input> would clip a long title to one
                    line); hidden fields carry the values for form submission. */}
                <p className="font-bold break-words">{title}</p>
                <p className="text-sm break-words text-muted">{artist}</p>
                <input type="hidden" name="title" value={title} />
                <input type="hidden" name="artist" value={artist} />
              </>
            )}
          </div>
          <Button
            type="button"
            variant="link"
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
            className="shrink-0 self-start text-xs"
          >
            {editing ? 'done' : 'edit'}
          </Button>
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
                setDeriveError(null)
                lastDerived.current = ''
              }}
              className="underline hover:text-accent"
            >
              pick another
            </button>
            .
          </p>
        )}
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setSelected(null)
            setQuery('')
            setEditing(false)
            setDeriveError(null)
            lastDerived.current = ''
          }}
          className="mt-2 text-xs"
        >
          change track
        </Button>
      </div>
    )
  }

  return (
    <div
      key="search"
      className="rounded-md border border-border bg-surface p-4"
    >
      <div className="flex items-start gap-4">
        {/* Decorative pre-resolution art: hidden on mobile so the input — and the
            search dropdown anchored to its width — isn't squeezed to ~160px. */}
        <div className="hidden shrink-0 sm:block">
          <VinylPlaceholder className="h-32 w-32 rounded" />
        </div>
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
            aria-describedby="post-link-hint"
          />
          <p id="post-link-hint" className="mt-2 text-xs text-muted">
            Works with links from Spotify, Apple Music, YouTube, SoundCloud, and
            Bandcamp.
          </p>
          {busy && (
            <p
              className="mt-2 text-sm text-muted"
              role="status"
              aria-live="polite"
            >
              Looking up link…
            </p>
          )}
          {deriveError && !busy && (
            <p
              className="mt-2 text-sm text-red-600"
              role="status"
              aria-live="polite"
            >
              {deriveError === 'unknown-host' &&
                'That’s not a music link we recognize. Search for the song above, or paste a link from Spotify, Apple Music, YouTube, SoundCloud, or Bandcamp.'}
              {deriveError === 'unreadable' &&
                'Couldn’t read a song from that link. Try a single-track link from a supported service, or search above.'}
              {deriveError === 'transient' && (
                <>
                  Couldn’t reach that link just now.{' '}
                  <button
                    type="button"
                    onClick={retry}
                    className="underline hover:text-accent"
                  >
                    Retry
                  </button>
                </>
              )}
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
    </div>
  )
}
