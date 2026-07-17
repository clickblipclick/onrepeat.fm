'use client'

import { Check, Link as LinkIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { blueskyComposeUrl, buildShareText } from '@/lib/share'

/** Bluesky butterfly, sized to match the 16px lucide icons in the action row. */
function BlueskyIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 600 530"
      fill="currentColor"
      aria-hidden
    >
      <path d="M135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46C512.26 8.009 590-19.862 590 68.825c0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.38-3.69-10.832-3.708-7.896-.017-2.936-1.193.516-3.707 7.896-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.449-163.25-81.433C20.15 217.613 9.997 86.535 9.997 68.825c0-88.687 77.742-60.816 125.72-24.795z" />
    </svg>
  )
}

/** Resolve the jam permalink — absolute (detail page) or root-relative (feed
 *  cards) — against the current origin at click time. */
function resolveJamUrl(jamUrl: string): string {
  return new URL(jamUrl, window.location.origin).href
}

export function ShareButton({
  title,
  artist,
  jamUrl,
}: {
  title: string
  artist: string
  jamUrl: string
}) {
  const [copied, setCopied] = useState(false)
  // Built after mount: the compose text needs the absolute jam URL, which for
  // feed cards is only resolvable against window.location on the client.
  const [composeHref, setComposeHref] = useState<string>()

  useEffect(() => {
    const text = buildShareText({ title, artist, url: resolveJamUrl(jamUrl) })
    setComposeHref(blueskyComposeUrl(text))
  }, [title, artist, jamUrl])

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(resolveJamUrl(jamUrl))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (insecure context / denied) — nothing to fall back to.
    }
  }

  return (
    <>
      <a
        href={composeHref}
        target="_blank"
        rel="noopener noreferrer"
        // ml-auto pushes the share pair to the right edge of the action row,
        // separating them from the social actions (like, re-jam) on the left.
        className="ml-auto inline-flex cursor-pointer items-center gap-1 hover:text-accent"
        aria-label="Share to Bluesky"
      >
        <BlueskyIcon />
        Share
      </a>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex cursor-pointer items-center gap-1 hover:text-accent"
      >
        {copied ? (
          <>
            <Check size={16} aria-hidden />
            Copied
          </>
        ) : (
          <>
            <LinkIcon size={16} aria-hidden />
            Copy link
          </>
        )}
      </button>
    </>
  )
}
