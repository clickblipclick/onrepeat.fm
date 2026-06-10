'use client'

import { useActionState, useEffect } from 'react'
import { postJamAction, type PostJamState } from './actions'
import { TrackPicker } from './_components/track-picker'
import { Button } from './_components/ui/button'
import { inputClassName } from '../lib/input-variants'

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
        className={inputClassName('w-full')}
      />
      <Button type="submit" loading={pending}>
        Set as my jam
      </Button>
      <div aria-live="polite" aria-atomic="true">
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
