import { Send } from 'lucide-react'

import { buildBlueskyShareUrl } from '../../lib/share'

export function ShareButton({
  title,
  artist,
  jamUrl,
}: {
  title: string
  artist: string
  jamUrl: string
}) {
  const href = buildBlueskyShareUrl({ title, artist, url: jamUrl })
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex cursor-pointer items-center gap-1 hover:text-accent"
    >
      <Send size={16} aria-hidden />
      Share
    </a>
  )
}
