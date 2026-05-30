'use client'

import { useActionState } from 'react'
import { postJamAction, type PostJamState } from './actions'

export function PostJamForm() {
  const [state, action, pending] = useActionState<PostJamState | null, FormData>(
    postJamAction,
    null,
  )
  return (
    <form action={action}>
      <input name="sourceUrl" placeholder="https://open.spotify.com/track/..." />
      <input name="title" placeholder="Song title" />
      <input name="artist" placeholder="Artist" />
      <input name="caption" placeholder="why this song (optional)" />
      <button type="submit" disabled={pending}>
        {pending ? 'Posting…' : 'Set as my jam'}
      </button>
      {state?.ok && <p>✓ Jam posted: {state.uri}</p>}
      {state && !state.ok && <p>⚠ {state.error}</p>}
    </form>
  )
}
