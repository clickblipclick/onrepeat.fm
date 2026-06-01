'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { postJamAction, type PostJamState } from './actions'

const input = 'w-full rounded border border-border bg-surface px-3 py-2'

export function PostJamForm() {
  const [state, action, pending] = useActionState<PostJamState | null, FormData>(postJamAction, null)
  return (
    <form action={action} className="flex flex-col gap-3">
      <input name="sourceUrl" aria-label="Song URL" placeholder="https://open.spotify.com/track/..." className={input} />
      <input name="title" aria-label="Song title" placeholder="Song title" className={input} />
      <input name="artist" aria-label="Artist" placeholder="Artist" className={input} />
      <input name="caption" aria-label="Caption (optional)" placeholder="why this song (optional)" className={input} />
      <button type="submit" disabled={pending} className="rounded bg-accent px-3 py-2 text-on-accent disabled:opacity-60">
        {pending ? 'Posting…' : 'Set as my jam'}
      </button>
      <div aria-live="polite" aria-atomic="true">
        {state?.ok && (
          <p className="text-sm text-accent">
            ✓ Jam posted — <Link href="/" className="underline">back to feed</Link>
          </p>
        )}
        {state && !state.ok && <p className="text-sm text-red-700">⚠ {state.error}</p>}
      </div>
    </form>
  )
}
