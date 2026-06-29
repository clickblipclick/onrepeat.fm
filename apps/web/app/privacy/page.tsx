import type { Metadata } from 'next'
import Link from 'next/link'

import { linkInline } from '../../lib/link-variants'

export const metadata: Metadata = {
  title: 'Privacy Policy · onrepeat.fm',
  description: 'How onrepeat.fm handles your data.',
}

export default function PrivacyPage() {
  return (
    <article className="space-y-4 text-sm text-muted">
      <header>
        <h1 className="text-lg font-bold text-ink">Privacy Policy</h1>
        <p className="mt-1 text-xs text-muted">Effective date: June 19, 2026</p>
      </header>

      <p>
        This Privacy Policy explains how Hey Ben, LLC (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;), the operator of onrepeat.fm (the
        &ldquo;Service&rdquo;), handles information. Contact us at{' '}
        <a href="mailto:help@onrepeat.fm" className={linkInline}>
          help@onrepeat.fm
        </a>
        .
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">
          We don&rsquo;t collect passwords
        </h2>
        <p>
          You sign in with your Bluesky (AT Protocol) account using OAuth
          through your own data server. We never see or store your password. We
          store an encrypted session cookie containing only your account
          identifier (DID); the OAuth tokens needed to act on your behalf when
          you post or like are kept in our server-side store, not in the cookie.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">
          Your activity is public by design
        </h2>
        <p>
          The tracks and likes you create are public records stored on{' '}
          <strong>your own Personal Data Server (PDS)</strong> on the AT
          Protocol network. The Service indexes public records from the network
          into our own database so we can build feeds and profiles. We do not
          control the public nature of AT Protocol data.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Cookies</h2>
        <p>
          We use a session cookie to keep you signed in (essential), and a
          non-essential preference cookie that remembers your default playback
          service. We do not use third-party analytics or advertising trackers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Third parties</h2>
        <p>
          The Service uses Bluesky&rsquo;s public API to display profiles,
          embeds media players from providers such as Apple Music/iTunes,
          YouTube, Bandcamp, SoundCloud, and Spotify, and runs on a third-party
          hosting provider. When a player loads, information such as your IP
          address is shared with that provider under their own privacy policy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Your control over your data</h2>
        <p>
          Deleting a track removes it from your PDS and from our index. Signing
          out clears your session cookie. Because your records live on your own
          PDS, your AT Protocol data ultimately remains yours and is portable.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Data retention</h2>
        <p>
          Our index mirrors public network state. When records are deleted or
          expire on the network, they are removed from our index.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Children</h2>
        <p>
          The Service is not directed to children under 13 (or the minimum age
          required in your jurisdiction).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Changes</h2>
        <p>
          We may update this Policy from time to time. The effective date at the
          top reflects the latest version.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Contact</h2>
        <p>
          Questions about this Policy? Email{' '}
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
