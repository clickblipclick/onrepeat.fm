'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { buttonClassName } from '../../lib/button-variants'

/** The header "+ post a song" button. Hidden on /post itself — the full page or the
 *  intercepting modal (both set the path to /post) — since you're already composing.
 *  scroll={false}: opening /post is intercepted into a modal over the current feed;
 *  without it Next's scroll-to-top yanks the feed as the modal opens. */
export function PostNavLink() {
  if (usePathname() === '/post') return null
  return (
    <Link
      href="/post"
      scroll={false}
      className={buttonClassName({ variant: 'outline', size: 'sm' })}
    >
      <span className="sm:hidden">+ post</span>
      <span className="hidden sm:inline">+ post a song</span>
    </Link>
  )
}
