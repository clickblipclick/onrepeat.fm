import type { HydratedJamView } from '@onrepeat/appview'
import { Player } from './player'
import { JamHeader, JamBody, JamActions } from './jam-parts'
import { cardPattern } from '../../lib/card-pattern'

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
  const jamHref = `/jam/${encodeURIComponent(jam.author.handle ?? jam.authorDid)}/${rkeyOf(jam.uri)}`
  return (
    // Scope the card to its author's theme — the CSS-variable cascade (globals.css)
    // re-colors everything inside. The thick ink border + offset accent shadow + framed
    // artwork give the card weight and make the author's theme pop (riso-print feel).
    <article
      data-theme={jam.author.theme}
      className={`${cardPattern(jam.authorDid)} overflow-hidden rounded-md border-2 border-accent bg-surface shadow-[4px_4px_0_0_var(--accent)] transition-shadow hover:shadow-[6px_6px_0_0_var(--accent)]`}
    >
      <JamHeader jam={jam} jamHref={jamHref} viewerDid={viewerDid} />

      {/* Artwork sits inset on the themed surface with a crisp frame, so it reads as a
          framed object rather than a flush block. */}
      <div className="p-4">
        <div className="overflow-hidden rounded">
          {player ?? (
            <Player
              sourceProvider={jam.sourceProvider}
              providerRefs={jam.providerRefs}
              sourceUrl={jam.sourceUrl}
              artworkUrl={jam.artworkUrl}
              lazy
              priority={priority}
              preferredProvider={preferredProvider}
            />
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <JamBody jam={jam} href={jamHref} />
        <div className="mt-3 flex items-center gap-4 border-t border-border pt-2 text-sm text-muted">
          {actions ?? <JamActions jam={jam} loggedIn={loggedIn} />}
        </div>
      </div>
    </article>
  )
}

export { rkeyOf }
