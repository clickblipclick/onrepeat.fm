import type { Metadata } from 'next'
import Link from 'next/link'

import { linkInline } from '@/lib/link-variants'

export const metadata: Metadata = {
  title: 'About · onrepeat.fm',
  description: 'What onrepeat.fm is and how it works.',
}

export default function AboutPage() {
  return (
    <article className="space-y-4 text-sm text-muted">
      <header>
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

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">How do I sign in?</h2>
        <p>
          With your Bluesky (AT Protocol) account. Sign-in happens through your
          own data server &mdash; there is no separate onrepeat.fm password.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Where do my jams live?</h2>
        <p>
          Your jams and likes are stored as public records on your own Personal
          Data Server (PDS), not in a private onrepeat.fm database. onrepeat.fm
          reads them from the network &mdash; you own the data.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">
          What music services can I post from?
        </h2>
        <p>
          Apple Music, YouTube and YouTube Music, Bandcamp, SoundCloud, TIDAL,
          and Spotify. Paste a track link and onrepeat.fm figures out the rest,
          embedding playback straight from the service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">
          Can I pick which service plays jams?
        </h2>
        <p>
          Yes &mdash; choose a preferred playback service in{' '}
          <Link href="/settings" className={linkInline}>
            Settings
          </Link>{' '}
          and jams will play there whenever the track is available on it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">How do I delete my data?</h2>
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
        <h2 className="font-semibold text-ink">Is it open source?</h2>
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

      <p className="pt-2">
        <Link href="/" className={linkInline}>
          Back to the feed
        </Link>
      </p>
    </article>
  )
}
