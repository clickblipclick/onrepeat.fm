import { relativeTime } from '../../lib/format'

export function RelativeTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="text-muted" title={iso}>
      {relativeTime(iso)}
    </time>
  )
}
