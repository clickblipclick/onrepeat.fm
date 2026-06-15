/** Vinyl-record artwork placeholder, shown when a track has no cover art. The center label
 *  and groove tint use the theme accent (var(--accent)), so it picks up whatever palette is
 *  in scope; the disc and paper tile are fixed colors so it stays legible in any theme and in
 *  light or dark, the way real album art doesn't invert. Pass size/shape via `className` to
 *  match the <img> it stands in for, e.g. "h-20 w-20 rounded". */
export function VinylPlaceholder({ className = '' }: { className?: string }) {
  return (
    <span className={`block shrink-0 overflow-hidden ${className}`} aria-hidden>
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <rect width="100" height="100" fill="#e8e4da" />
        <circle cx="50" cy="50" r="46" fill="#1b1a19" />
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
        <circle cx="50" cy="50" r="3" fill="#e8e4da" />
      </svg>
    </span>
  )
}
