import { Repeat } from 'lucide-react'

/** Decorative "repeat" hero for the login screen: two static concentric rings, a
 *  slowly-rotating accent arc, and a centered repeat glyph. Color is inherited from the
 *  surrounding data-theme (text-accent / text-border) — this component owns no theme logic.
 *  The arc holds still under prefers-reduced-motion. Decorative, so aria-hidden. */
export function RepeatRings() {
  return (
    <div className="relative mx-auto mb-4 h-24 w-24" aria-hidden="true">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full text-border"
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          cx="50"
          cy="50"
          r="33"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full animate-spin text-accent [animation-duration:8s] motion-reduce:animate-none"
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="72 217"
        />
      </svg>
      <Repeat className="absolute inset-0 m-auto h-7 w-7 text-accent" />
    </div>
  )
}
