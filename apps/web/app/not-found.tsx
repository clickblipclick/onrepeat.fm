import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center">
      <h1 className="font-semibold text-muted">Nothing here.</h1>
      <p className="mt-2 text-sm">
        <Link href="/" className="text-accent">Back to the feed</Link>
      </p>
    </div>
  )
}
