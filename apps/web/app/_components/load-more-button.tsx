'use client'

import { cn } from '../../lib/cn'

/** The dashed "load more / loading… / retry" pagination control shared by LoadMore and
 *  ArchiveGrid. Owns the label state machine so the two stay identical. */
export function LoadMoreButton({
  onClick,
  loading,
  error,
  className,
}: {
  onClick: () => void
  loading: boolean
  error: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'w-full rounded border border-dashed border-border py-2 text-sm text-muted hover:text-accent disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {loading ? 'loading…' : error ? "couldn't load — retry" : 'load more ↓'}
    </button>
  )
}
