export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-md border border-border bg-surface"
        >
          <div className="surface-grid h-9 border-b border-border" />
          <div className="aspect-square w-full animate-pulse bg-border" />
          <div className="h-16 p-3" />
        </div>
      ))}
    </div>
  )
}
