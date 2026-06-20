import Link from 'next/link'
import type { Metadata } from 'next'
import { linkInline } from '../../lib/link-variants'

export const metadata: Metadata = {
  title: 'Terms of Use · onrepeat.fm',
  description: 'The terms that govern your use of onrepeat.fm.',
}

export default function TermsPage() {
  return (
    <article className="space-y-4 text-sm text-muted">
      <header>
        <h1 className="text-lg font-bold text-ink">Terms of Use</h1>
        <p className="mt-1 text-xs text-muted">Effective date: June 19, 2026</p>
      </header>

      <p>
        These Terms of Use (&ldquo;Terms&rdquo;) govern your use of onrepeat.fm
        (the &ldquo;Service&rdquo;), operated by Hey Ben, LLC (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;). By using the Service, you agree to these Terms. If
        you do not agree, do not use the Service.
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">The Service</h2>
        <p>
          onrepeat.fm is a music-sharing application built on the{' '}
          <a
            href="https://atproto.com"
            target="_blank"
            rel="noopener noreferrer"
            className={linkInline}
          >
            AT Protocol
          </a>
          . It lets you share the song you have on repeat. Posting requires a
          Bluesky (AT Protocol) account; sign-in happens through your own data
          server.
        </p>
        <p>
          We are an independent project and are not affiliated with, endorsed
          by, or sponsored by Bluesky or the AT Protocol. onrepeat.fm is open
          source. These Terms apply to your use of the hosted service at
          onrepeat.fm, not to self-hosted instances or forks of the source code.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Your content &amp; conduct</h2>
        <p>
          The jams and likes you create are stored as records on{' '}
          <strong>your own Personal Data Server (PDS)</strong> and are{' '}
          <strong>public</strong> on the AT Protocol network. You are
          responsible for the content you post and the links you share, and you
          agree not to post anything unlawful, infringing, or abusive. You must
          have the right to share what you link to.
        </p>
        <p>
          You must be at least 13 years old (or the minimum age required in your
          jurisdiction) to use the Service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Third-party services</h2>
        <p>
          The Service relies on third parties, including your PDS / Bluesky and
          embedded players from Apple Music/iTunes, YouTube, Bandcamp,
          SoundCloud, and Spotify. We do not host or control that content or
          playback, and your use of it is governed by those providers&rsquo; own
          terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Intellectual property</h2>
        <p>
          You retain rights to your content. If you believe content on the
          Service infringes your rights, contact us at{' '}
          <a href="mailto:help@onrepeat.fm" className={linkInline}>
            help@onrepeat.fm
          </a>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">
          Disclaimer &amp; limitation of liability
        </h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;, without warranties of any kind. To the fullest
          extent permitted by law, Hey Ben, LLC will not be liable for any
          indirect, incidental, or consequential damages arising from your use
          of the Service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or restrict
          access to the Service for conduct that violates these Terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Changes</h2>
        <p>
          We may update these Terms from time to time. Continued use of the
          Service after changes take effect means you accept the updated Terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Minnesota,
          without regard to its conflict-of-laws rules.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Contact</h2>
        <p>
          Questions about these Terms? Email{' '}
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
