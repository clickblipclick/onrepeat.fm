import Link from 'next/link'
import { EmptyState } from './_components/empty-state'

export default function NotFound() {
  return (
    <EmptyState>
      <h1 className="font-semibold text-muted">Nothing here.</h1>
      <p className="mt-2 text-sm">
        <Link href="/" className="text-accent">
          Back to the feed
        </Link>
      </p>
    </EmptyState>
  )
}
