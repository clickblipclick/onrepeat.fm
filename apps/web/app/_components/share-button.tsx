'use client'

import { Check, Send } from 'lucide-react'
import { useState } from 'react'

import { buildShareData } from '../../lib/share'

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

  async function onShare() {
    // Accept either an absolute URL (detail page) or a root-relative path (feed
    // cards) — resolve against the current origin at click time.
    const url = new URL(jamUrl, window.location.origin).href
    const data = buildShareData({ title, artist, url })
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(data)
      } catch {
        // User dismissed the share sheet (AbortError) or it failed — no-op.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (insecure context / denied) — nothing to fall back to.
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className="inline-flex cursor-pointer items-center gap-1 hover:text-accent"
    >
      {copied ? (
        <>
          <Check size={16} aria-hidden />
          Copied
        </>
      ) : (
        <>
          <Send size={16} aria-hidden />
          Share
        </>
      )}
    </button>
  )
}
