'use client'

import Link from 'next/link'
import { useActionState, useEffect } from 'react'
import { postJamAction, type PostJamState } from './actions'
import { TrackPicker } from './_components/track-picker'

export function PostJamForm() {
  const [state, action, pending] = useActionState<
    PostJamState | null,
    FormData
  >(postJamAction, null)

  // A dead OAuth session only surfaces when the write runs — bounce to re-auth.
  useEffect(() => {
    if (state && !state.ok && state.error === 'session-expired') {
      window.location.href = '/login?expired=1'
    }
  }, [state])

  return (
    <form action={action} className="flex flex-col gap-3">
      <TrackPicker />
      <input
        name="caption"
        aria-label="Caption (optional)"
        placeholder="why this song (optional)"
        className="w-full rounded border border-border bg-surface px-3 py-2"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-accent px-3 py-2 text-on-accent disabled:opacity-60"
      >
        {pending ? 'Posting…' : 'Set as my jam'}
      </button>
      <div aria-live="polite" aria-atomic="true">
        {state?.ok && (
          <p className="text-sm text-accent">
            ✓ Jam posted —{' '}
            <Link href="/" className="underline">
              back to feed
            </Link>
          </p>
        )}
        {state && !state.ok && state.error !== 'session-expired' && (
          <p className="text-sm text-red-700">
            ⚠{' '}
            {state.error === 'temporary'
              ? 'Something went wrong — please try again.'
              : state.error}
          </p>
        )}
      </div>
    </form>
  )
}
