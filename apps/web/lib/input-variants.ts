import { cn } from './cn'

const BASE =
  'rounded border border-border bg-surface px-3 py-2 text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

/** Shared class string for text inputs. Width is intentionally NOT included — callers
 *  add `w-full` (most) or `flex-1` (login's flex row), since cn() does not merge Tailwind
 *  conflicts. Mirrors lib/button-variants.ts. */
export function inputClassName(className?: string): string {
  return cn(BASE, className)
}
