import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded font-bold transition ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
  'disabled:pointer-events-none disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:opacity-90',
  secondary: 'border border-border bg-surface text-ink hover:bg-bg',
  ghost: 'bg-transparent text-ink hover:bg-surface',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
}

/** Resolve the class string for a button look — shared by <Button> and any element
 *  that should look like a button (e.g. a <Link>). Pure + framework-agnostic. */
export function buttonClassName(opts?: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}): string {
  const { variant = 'primary', size = 'md', className } = opts ?? {}
  return cn(BASE, VARIANTS[variant], SIZES[size], className)
}
