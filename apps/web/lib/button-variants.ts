import { cn } from './cn'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'outline'
  | 'link'
export type ButtonSize = 'sm' | 'md' | 'none'

// font-bold lives per-variant (not in BASE) so the bare `link` variant can stay regular
// weight — cn() doesn't merge Tailwind conflicts, so BASE could not be overridden.
const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded transition ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
  'disabled:pointer-events-none disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent font-bold text-on-accent hover:opacity-90',
  secondary: 'border border-border bg-surface font-bold text-ink hover:bg-bg',
  ghost: 'bg-transparent font-bold text-ink hover:bg-surface',
  outline:
    'border border-ink bg-transparent font-bold text-ink hover:border-accent hover:bg-accent hover:text-on-accent',
  danger: 'bg-red-600 font-bold text-white hover:bg-red-700',
  // Bare text/icon action — no fill, no padding, just a muted label that accents on hover.
  link: 'bg-transparent text-muted hover:text-accent',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
  none: '',
}

/** Resolve the class string for a button look — shared by <Button> and any element
 *  that should look like a button (e.g. a <Link>). Pure + framework-agnostic. The `link`
 *  variant defaults to the paddingless `none` size; everything else defaults to `md`. */
export function buttonClassName(opts?: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}): string {
  const { variant = 'primary', size, className } = opts ?? {}
  const resolvedSize = size ?? (variant === 'link' ? 'none' : 'md')
  return cn(BASE, VARIANTS[variant], SIZES[resolvedSize], className)
}
