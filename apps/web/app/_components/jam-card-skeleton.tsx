/** Placeholder matching JamCard's shell while jam content loads. */
export function JamCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="surface-grid h-9 border-b border-border" />
      <div className="aspect-square w-full animate-pulse bg-border" />
      <div className="h-16 p-3" />
    </div>
  )
}
