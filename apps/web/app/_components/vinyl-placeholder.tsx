/** Vinyl-record artwork placeholder, shown when a track has no cover art. All colors come
 *  from theme tokens: the sleeve/spindle use --surface and the disc uses --ink (the two are
 *  guaranteed to contrast in every palette), while the grooves and center label use --accent.
 *  So it tracks the active theme and light/dark automatically — the disc inverts to a light
 *  pressing in dark mode rather than vanishing into a dark surface. Pass size/shape via
 *  `className` to match the <img> it stands in for, e.g. "h-20 w-20 rounded". */
export function VinylPlaceholder({ className = '' }: { className?: string }) {
  return (
    <span className={`block shrink-0 overflow-hidden ${className}`} aria-hidden>
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <rect width="100" height="100" fill="var(--surface)" />
        <circle cx="50" cy="50" r="46" fill="var(--ink)" />
        <circle
          cx="50"
          cy="50"
          r="39"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.22"
          strokeWidth="1.1"
        />
        <circle
          cx="50"
          cy="50"
          r="32"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.22"
          strokeWidth="1.1"
        />
        <circle
          cx="50"
          cy="50"
          r="25"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.22"
          strokeWidth="1.1"
        />
        <circle cx="50" cy="50" r="15" fill="var(--accent)" />
        <circle cx="50" cy="50" r="3" fill="var(--surface)" />
      </svg>
    </span>
  )
}
