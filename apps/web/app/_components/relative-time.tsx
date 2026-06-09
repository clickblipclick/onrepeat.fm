import { relativeTime } from '../../lib/format'

export function RelativeTime({
  iso,
  className = 'text-muted',
}: {
  iso: string
  className?: string
}) {
  return (
    <time dateTime={iso} className={className} title={iso}>
      {relativeTime(iso)}
    </time>
  )
}
