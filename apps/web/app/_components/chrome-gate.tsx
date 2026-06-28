'use client'

import { usePathname } from 'next/navigation'

// Routes that render without the app chrome (nav + footer): a bare, vertically-centered
// full-viewport screen. Keep this list tiny — it's only the pre-auth screens.
const BARE_ROUTES = new Set(['/login'])

/** Gates the app chrome by route. On normal routes it renders the nav, the constrained
 *  main column, and the footer. On a bare route (e.g. /login) it drops the chrome and
 *  centers the page content in the viewport. `nav`/`footer` are passed in as already-
 *  rendered server components, so this client boundary doesn't pull them client-side.
 *  usePathname resolves during SSR too, so the correct branch renders with no flash. */
export function ChromeGate({
  nav,
  footer,
  children,
}: {
  nav: React.ReactNode
  footer: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()
  if (BARE_ROUTES.has(pathname)) {
    return (
      <main className="flex grow flex-col items-center justify-center px-4 py-10">
        {children}
      </main>
    )
  }
  return (
    <>
      {nav}
      <main className="mx-auto w-full max-w-2xl grow px-4 py-6">
        {children}
      </main>
      {footer}
    </>
  )
}
