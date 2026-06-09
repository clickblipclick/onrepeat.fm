'use client'

import { useEffect, useLayoutEffect } from 'react'

// Layout effect on the client (apply before paint → no flash on soft navigation); falls
// back to useEffect during SSR to avoid React's "useLayoutEffect does nothing on the
// server" warning.
const useIsoLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Applies `theme` to the root <html> element for as long as this component is mounted,
 * restoring the previous value on unmount. The App Router's root layout owns <html>, so a
 * nested route (the profile page) can't set its attributes server-side — this does it
 * client-side instead, theming the whole shell (nav + background + cards) in the profile
 * owner's color and reverting to the neutral chrome when you navigate away.
 *
 * Soft navigations are flash-free. A hard refresh of a profile URL can show the neutral
 * chrome for one frame before hydration, since the SSR'd <html> starts neutral.
 */
export function HtmlTheme({ theme }: { theme: string }) {
  useIsoLayoutEffect(() => {
    const el = document.documentElement
    const prev = el.getAttribute('data-theme')
    el.setAttribute('data-theme', theme)
    return () => {
      if (prev === null) el.removeAttribute('data-theme')
      else el.setAttribute('data-theme', prev)
    }
  }, [theme])
  return null
}
