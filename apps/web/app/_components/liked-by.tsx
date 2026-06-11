'use client'

import { createContext, useContext, useState } from 'react'
import { Avatar, type DisplayAuthor } from './avatar'
import { SectionLabel } from './section-label'

interface LikeSync {
  /** The viewer's like state as last set by the like button; null = server truth. */
  liked: boolean | null
  setLiked: (liked: boolean | null) => void
}

const LikeContext = createContext<LikeSync | null>(null)

/** Optional bridge for the like button: present only where something else (the
 *  "Liked by" row) mirrors the viewer's like state. Null in plain feed cards. */
export function useLikeSync(): LikeSync | null {
  return useContext(LikeContext)
}

/** Shares the viewer's like state between the like button and the "Liked by" avatar
 *  row on the jam detail page, so liking/unliking updates the row instantly. The
 *  server-rendered list only changes once the firehose ingester indexes the like, so
 *  without this bridge it would stay stale until the next full load. */
export function LikeProvider({ children }: { children: React.ReactNode }) {
  const [liked, setLiked] = useState<boolean | null>(null)
  return (
    <LikeContext.Provider value={{ liked, setLiked }}>
      {children}
    </LikeContext.Provider>
  )
}

/** The "Liked by" avatar row. Renders the server-indexed likers, with the viewer
 *  optimistically added/removed per the like button's state from <LikeProvider> —
 *  including appearing from nothing on a jam's first like. */
export function LikedBy({
  likerDids,
  profiles,
  viewerDid,
}: {
  /** Liker DIDs from the index, most recent first. */
  likerDids: string[]
  /** Profile lookup for likers (and the viewer); missing DIDs get fallback avatars. */
  profiles: Record<string, DisplayAuthor>
  viewerDid?: string
}) {
  const liked = useContext(LikeContext)?.liked
  let dids = likerDids
  if (viewerDid && liked === true && !likerDids.includes(viewerDid)) {
    dids = [viewerDid, ...likerDids]
  } else if (viewerDid && liked === false) {
    dids = likerDids.filter((d) => d !== viewerDid)
  }
  if (dids.length === 0) return null

  return (
    <div className="mt-4">
      <SectionLabel flush>Liked by</SectionLabel>
      <div className="mt-1 flex flex-wrap gap-1">
        {dids.slice(0, 12).map((d) => (
          <Avatar key={d} author={profiles[d] ?? { did: d }} size={22} />
        ))}
        {dids.length > 12 && (
          <span className="self-center text-xs text-muted">
            +{dids.length - 12}
          </span>
        )}
      </div>
    </div>
  )
}
