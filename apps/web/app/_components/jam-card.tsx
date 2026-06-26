import type { HydratedJamView } from '@onrepeat/appview'

import { JamCardShell, MediaFrame } from './jam-card-shell'
import { JamActions, JamBody, JamHeader } from './jam-parts'
import { PlaybackProvider, PlaybackSwitcher } from './playback'
import { Player } from './player'

function rkeyOf(uri: string): string {
  return uri.split('/').pop() ?? ''
}

/** The core feed/profile card. A shared component (renders in both the server tree
 *  via FeedList and the client tree via LoadMore); it mounts a lazy <Player> for the
 *  media area and a static action row by default. Callers may override either via the
 *  optional `player` / `actions` props. The header/body/action chrome is shared with the
 *  jam detail page through <JamHeader>/<JamBody>/<JamActions> (jam-parts) so they stay
 *  consistent — the card links the timestamp + title to the permalink and adds a hover
 *  lift, since the whole card is a route into the post. */
export function JamCard({
  jam,
  player,
  actions,
  loggedIn = false,
  viewerDid,
  priority = false,
  preferredProvider,
}: {
  jam: HydratedJamView
  player?: React.ReactNode
  actions?: React.ReactNode
  loggedIn?: boolean
  /** The signed-in viewer's DID; when it matches the author, the owner menu shows. */
  viewerDid?: string
  /** Mark this card's cover as the LCP image (e.g. the first card in a feed). */
  priority?: boolean
  preferredProvider?: string
}) {
  const jamHref = `/profile/${encodeURIComponent(jam.author.handle ?? jam.authorDid)}/jam/${rkeyOf(jam.uri)}`
  return (
    // Scope the card to its author's theme — the CSS-variable cascade (globals.css)
    // re-colors everything inside. The thick ink border + offset accent shadow + framed
    // artwork give the card weight and make the author's theme pop (riso-print feel).
    <JamCardShell did={jam.authorDid} theme={jam.author.theme} interactive>
      <JamHeader jam={jam} jamHref={jamHref} viewerDid={viewerDid} />

      {/* One playback scope per card: the player (media frame) and the service switcher
          (beside the title) share the same state, so switching works mid-play. */}
      <PlaybackProvider
        sourceProvider={jam.sourceProvider}
        providerRefs={jam.providerRefs}
        sourceUrl={jam.sourceUrl}
        preferredProvider={preferredProvider}
      >
        {/* Artwork sits inset on the themed surface with a crisp frame, so it reads as a
            framed object rather than a flush block. */}
        <MediaFrame>
          {player ?? (
            <Player
              artworkUrl={jam.artworkUrl}
              title={jam.title}
              artist={jam.artist}
              priority={priority}
            />
          )}
        </MediaFrame>

        <div className="px-4 pb-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 flex-1">
              <JamBody jam={jam} href={jamHref} />
            </div>
            <PlaybackSwitcher />
          </div>
          <div className="mt-3 flex items-center gap-4 border-t border-border pt-2 text-sm text-muted">
            {actions ?? (
              <JamActions jam={jam} loggedIn={loggedIn} jamUrl={jamHref} />
            )}
          </div>
        </div>
      </PlaybackProvider>
    </JamCardShell>
  )
}

export { rkeyOf }
