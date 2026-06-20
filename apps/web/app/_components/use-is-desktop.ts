'use client'

import { useEffect, useState } from 'react'

const DESKTOP = '(min-width: 1024px)' // Tailwind `lg`

/** True at desktop widths. Returns false during SSR / first paint, then resolves on mount and
 *  tracks changes — playback is a client-only interaction, so the pre-mount value is unused. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP)
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])
  return isDesktop
}
