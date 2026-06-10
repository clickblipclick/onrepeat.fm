import { cn } from '../../lib/cn'

export function EmptyState({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-dashed border-border p-8 text-center text-muted',
        className,
      )}
    >
      {children}
    </div>
  )
}
