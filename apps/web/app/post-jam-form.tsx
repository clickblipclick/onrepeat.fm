'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { postJamAction, type PostJamState } from './actions'
import { TrackPicker } from './_components/track-picker'
import { Button } from './_components/ui/button'
import { inputClassName } from '../lib/input-variants'
import { isPostDirty } from '../lib/post-form'

export function PostJamForm({
  onSuccess,
  onDirtyChange,
}: {
  /** Called after a successful write. The full page navigates to '/', the modal pops back. */
  onSuccess?: () => void
  /** Called as the form gains/loses unsaved content, so a host modal can guard dismissal. */
  onDirtyChange?: (dirty: boolean) => void
} = {}) {
  const [state, action, pending] = useActionState<
    PostJamState | null,
    FormData
  >(postJamAction, null)
  const [trackContent, setTrackContent] = useState(false)
  const [caption, setCaption] = useState('')

  // Report dirtiness up to a host (e.g. the modal) so it can confirm before discarding.
  useEffect(() => {
    onDirtyChange?.(isPostDirty({ trackContent, caption }))
  }, [trackContent, caption, onDirtyChange])

  // Keep the latest onSuccess in a ref so the success effect fires it exactly once — when
  // `state` flips to ok — instead of re-running every time a caller passes a fresh inline
  // callback (useActionState keeps `state` as { ok: true } after the action resolves).
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  })

  // Resolve the action result: success hands navigation to the caller; a dead OAuth
  // session (only detectable once the write runs) bounces to re-auth.
  useEffect(() => {
    if (!state) return
    if (state.ok) {
      onSuccessRef.current?.()
      return
    }
    if (state.error === 'session-expired') {
      window.location.href = '/login?expired=1'
    }
    // onSuccess is intentionally omitted — it's read from a ref so success fires once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form action={action} className="flex flex-col gap-4">
      <TrackPicker onContentChange={setTrackContent} />
      <textarea
        name="caption"
        aria-label="Caption (optional)"
        placeholder="why this song (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={3}
        className={inputClassName('w-full resize-y')}
      />
      <Button type="submit" loading={pending} className="py-2.5 text-base">
        Put it on repeat
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
