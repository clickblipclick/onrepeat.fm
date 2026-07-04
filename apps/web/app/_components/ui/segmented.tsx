'use client'

import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  /** Accessible name; also the visible text when no `icon` is given. */
  label: string
  icon?: React.ReactNode
}

/** Design-system segmented control: mutually-exclusive options on an inset track,
 *  the active segment raised on the surface color. Toggle-button semantics
 *  (role=group + aria-pressed) rather than radios, matching the app's other
 *  pickers — radios would demand roving-tabindex arrow navigation.
 *  Controlled: pass `value` + `onChange`. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** Accessible name for the whole group. */
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-full border border-border bg-ink/5 p-0.5 inset-shadow-xs inset-shadow-ink/10"
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.icon ? option.label : undefined}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'cursor-pointer rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent',
              option.icon ? 'p-1.5' : 'px-2.5 py-1',
              // forced-colors: bg/shadow are stripped, so give the active segment
              // a real outline there (recolored to a visible system color).
              selected
                ? 'bg-surface text-ink shadow-sm forced-colors:outline-2 forced-colors:-outline-offset-2 forced-colors:outline-solid'
                : 'text-muted hover:text-ink',
            )}
          >
            {option.icon ?? option.label}
          </button>
        )
      })}
    </div>
  )
}
