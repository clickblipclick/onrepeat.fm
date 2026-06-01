'use client'

import { useEffect, useRef, useState } from 'react'
import type { TrackCandidate } from '@onrepeat/music'
import { deriveTrackAction } from '../actions'

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim())
const inputCls = 'w-full rounded border border-border bg-surface px-3 py-2'

/** Smart track input: type to search (iTunes via /api/track-search) or paste a link
 *  (Odesli via deriveTrackAction). Renders the title/artist/sourceUrl/artworkUrl form
 *  fields so the surrounding <form> submits them; manual entry is the failure fallback. */
export function TrackPicker() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TrackCandidate[]>([])
  const [selected, setSelected] = useState<TrackCandidate | null>(null)
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (selected || isUrl(query) || query.trim().length < 2) {
      setResults([])
      return
    }
    const id = setTimeout(async () => {
      const mine = ++seq.current
      try {
        const res = await fetch(`/api/track-search?q=${encodeURIComponent(query.trim())}`)
        const data = (await res.json()) as { results: TrackCandidate[] }
        if (mine === seq.current) setResults(data.results)
      } catch {
        if (mine === seq.current) setResults([])
      }
    }, 300)
    return () => clearTimeout(id)
  }, [query, selected])

  async function deriveFromUrl() {
    if (busy) return
    setBusy(true)
    const c = await deriveTrackAction(query.trim())
    setBusy(false)
    if (c) {
      setSelected(c)
      setResults([])
    } else {
      setManual(true) // keep the URL; let them type title/artist
    }
  }

  if (selected) {
    return (
      <div key={selected.sourceUrl} className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center gap-3">
          {selected.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.artworkUrl} alt="" className="h-14 w-14 rounded object-cover" />
          ) : (
            <span className="accent-grid h-14 w-14 rounded" />
          )}
          <div className="min-w-0 flex-1">
            <input name="title" defaultValue={selected.title} aria-label="Song title" className={`${inputCls} mb-1`} />
            <input name="artist" defaultValue={selected.artist} aria-label="Artist" className={inputCls} />
          </div>
        </div>
        <input type="hidden" name="sourceUrl" value={selected.sourceUrl} />
        <input type="hidden" name="artworkUrl" value={selected.artworkUrl ?? ''} />
        <button type="button" onClick={() => { setSelected(null); setQuery('') }} className="mt-2 text-xs text-muted hover:text-accent">
          change track
        </button>
      </div>
    )
  }

  if (manual) {
    return (
      <div className="flex flex-col gap-2">
        <input name="sourceUrl" defaultValue={isUrl(query) ? query.trim() : ''} placeholder="https://… (music link)" aria-label="Song URL" className={inputCls} />
        <input name="title" placeholder="Song title" aria-label="Song title" className={inputCls} />
        <input name="artist" placeholder="Artist" aria-label="Artist" className={inputCls} />
        <input type="hidden" name="artworkUrl" value="" />
        <button type="button" onClick={() => setManual(false)} className="self-start text-xs text-muted hover:text-accent">
          back to search
        </button>
      </div>
    )
  }

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a song, or paste a link…" aria-label="Search a song or paste a link" className={inputCls} />
      {isUrl(query) ? (
        <button type="button" onClick={deriveFromUrl} disabled={busy} className="mt-2 rounded bg-accent px-3 py-1.5 text-sm text-on-accent disabled:opacity-60">
          {busy ? 'Looking up…' : 'Use this link'}
        </button>
      ) : results.length > 0 ? (
        <ul className="mt-1 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
          {results.map((r) => (
            <li key={r.sourceUrl}>
              <button type="button" onClick={() => { setSelected(r); setResults([]) }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg">
                {r.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.artworkUrl} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <span className="accent-grid h-10 w-10 rounded" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{r.title}</span>
                  <span className="block truncate text-xs text-muted">{r.artist}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" onClick={() => setManual(true)} className="mt-2 text-xs text-muted hover:text-accent">
        enter manually
      </button>
    </div>
  )
}
