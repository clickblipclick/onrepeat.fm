const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** Compact relative time: now, 1m, 3h, 2d, 1w. `now` is injectable for tests.
 *  `now` covers anything under a minute (so we never render an awkward "0m"). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '?'
  const diff = Math.max(0, now - ts)
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return `${Math.floor(d / 7)}w`
}

/** A jam is "current" if it was created within the last 7 days. */
export function isCurrentJam(iso: string, now: number = Date.now()): boolean {
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return false
  return now - ts < SEVEN_DAYS_MS
}
