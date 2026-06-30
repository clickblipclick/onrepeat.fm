'use client'

import { useActionState, useEffect } from 'react'

import { THEME_LABELS, THEMES, type ThemeName } from '@onrepeat/core'

import { saveThemeAction, type SaveThemeState } from '@/app/actions'
import { cn } from '@/lib/cn'

/** Theme gallery. Each swatch is a submit button scoped to its own `data-theme`, so the
 *  preview colors are the real palette (and flip light/dark with the device). Selecting one
 *  posts the choice to saveThemeAction — no client state beyond the action's pending/error. */
export function ThemePicker({ current }: { current: ThemeName }) {
  const [state, action, pending] = useActionState<
    SaveThemeState | null,
    FormData
  >(saveThemeAction, null)

  // A pre-profile-scope session only fails when the write runs — bounce to re-auth.
  useEffect(() => {
    if (state && !state.ok && state.error === 'session-expired') {
      window.location.href = '/login?expired=1'
    }
  }, [state])

  return (
    <form action={action}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map((name) => {
          const selected = name === current
          return (
            <button
              key={name}
              type="submit"
              name="theme"
              value={name}
              data-theme={name}
              aria-pressed={selected}
              disabled={pending}
              className={cn(
                'flex flex-col gap-2 rounded-md border bg-surface p-3 text-left transition outline-none disabled:opacity-60',
                'focus-visible:ring-2 focus-visible:ring-accent',
                selected
                  ? 'border-accent ring-2 ring-accent'
                  : 'border-border hover:border-accent',
              )}
            >
              <span className="flex gap-1" aria-hidden>
                <span className="h-5 w-5 rounded-full bg-accent" />
                <span className="h-5 w-5 rounded-full border border-border bg-bg" />
                <span className="h-5 w-5 rounded-full bg-ink" />
              </span>
              <span className="text-sm font-bold text-ink">
                {THEME_LABELS[name]}
              </span>
              <span className="text-xs text-muted">
                {selected ? 'current' : ' '}
              </span>
            </button>
          )
        })}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {state && !state.ok && state.error !== 'session-expired' && (
          <p className="mt-3 text-sm text-red-700">
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
