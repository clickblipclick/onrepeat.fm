import type { Metadata } from 'next'
import Link from 'next/link'

import { linkInline } from '@/lib/link-variants'

import { ArtworkHero } from './artwork-hero'

export const metadata: Metadata = {
  title: 'About · onrepeat.fm',
  description: 'What onrepeat.fm is and how it works.',
}

export default function AboutPage() {
  return (
    <article className="space-y-4 text-sm text-muted">
      <ArtworkHero />

      <header className="relative">
        <h1 className="text-lg font-bold text-ink">About onrepeat.fm</h1>
      </header>

      <p>
        onrepeat.fm is a place to share the song you&rsquo;ve got on repeat.
        Post a jam and it takes the &ldquo;On repeat&rdquo; spot on your
        profile; your earlier jams stick around as history.
      </p>

      <p>
        It&rsquo;s an homage to{' '}
        <a
          href="https://en.wikipedia.org/wiki/This_Is_My_Jam"
          target="_blank"
          rel="noopener noreferrer"
          className={linkInline}
        >
          This Is My Jam
        </a>
        , rebuilt on the{' '}
        <a
          href="https://atproto.com"
          target="_blank"
          rel="noopener noreferrer"
          className={linkInline}
        >
          AT Protocol
        </a>
        , and it&rsquo;s open source.
      </p>

      <section className="space-y-4 border-t border-ink/10 pt-5">
        <h2 className="text-base font-bold text-ink">FAQ</h2>

        <section className="space-y-2">
          <h3 className="font-semibold text-ink">How do I sign in?</h3>
          <p>
            With your Bluesky (AT Protocol) account. Sign-in happens through
            your own data server &mdash; there is no separate onrepeat.fm
            password.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-ink">Where do my jams live?</h3>
          <p>
            Your jams and likes are stored as public records on your own
            Personal Data Server (PDS), not in a private onrepeat.fm database.
            onrepeat.fm reads them from the network &mdash; you own the data.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-ink">
            What music services can I post from?
          </h3>
          <p>
            Apple Music, YouTube and YouTube Music, Bandcamp, SoundCloud, TIDAL,
            and Spotify. Search for a song right in the post form, or paste a
            track link from any of them &mdash; onrepeat.fm figures out the
            rest, embedding playback straight from the service.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-ink">
            How does onrepeat.fm find a song on other services?
          </h3>
          <p>
            When you post a jam, onrepeat.fm looks the song up on Apple Music
            and YouTube using its title, artist, and length, and adds those
            links when it finds a confident match. Your jam plays from its
            original service right away &mdash; the extra links usually show up
            within a few seconds.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-ink">
            Why doesn&rsquo;t my jam link to every service?
          </h3>
          <p>
            A jam always keeps the service it was posted from, and matching can
            add Apple Music and YouTube on top &mdash; other services
            aren&rsquo;t cross-linked (yet). If a song just isn&rsquo;t on a
            service, no link is added. Bandcamp jams are left as-is on purpose:
            a lot of Bandcamp music lives only there.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-ink">
            What about remixes and live versions?
          </h3>
          <p>
            Matching is deliberately picky about versions &mdash; a remix or
            live take won&rsquo;t be swapped for the studio recording. The
            trade-off is that rarer versions sometimes don&rsquo;t match
            anything and stay on their original service only. If a match ever
            looks wrong, you can edit the title and artist in the post form
            before posting (that&rsquo;s what matching goes by), or email{' '}
            <a href="mailto:help@onrepeat.fm" className={linkInline}>
              help@onrepeat.fm
            </a>{' '}
            about a posted jam.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-ink">
            Can I pick which service plays jams?
          </h3>
          <p>
            Yes &mdash; choose a preferred playback service in{' '}
            <Link href="/settings" className={linkInline}>
              Settings
            </Link>{' '}
            and jams will play there whenever the track is available on it.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-ink">How do I delete my data?</h3>
          <p>
            Deleting a jam in the app removes the record from your PDS. For
            anything else, email{' '}
            <a href="mailto:help@onrepeat.fm" className={linkInline}>
              help@onrepeat.fm
            </a>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-ink">Is it open source?</h3>
          <p>
            Yes &mdash; the code lives on{' '}
            <a
              href="https://github.com/clickblipclick/onrepeat.fm"
              target="_blank"
              rel="noopener noreferrer"
              className={linkInline}
            >
              GitHub
            </a>
            . Questions, bugs, and ideas are welcome at{' '}
            <a href="mailto:help@onrepeat.fm" className={linkInline}>
              help@onrepeat.fm
            </a>
            .
          </p>
        </section>
      </section>

      <p className="pt-2">
        <Link href="/" className={linkInline}>
          Back to the feed
        </Link>
      </p>
    </article>
  )
}
