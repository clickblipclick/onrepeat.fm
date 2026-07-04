import './globals.css'

import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'

import { readViewerTheme } from '@/lib/viewer-theme'

import { ChromeGate } from './_components/chrome-gate'
import { PlayerHost } from './_components/player-host'
import { SiteFooter } from './_components/site-footer'
import { SiteNav } from './_components/site-nav'
import { UiProviders } from './_components/ui/providers'

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
})

const SITE_URL = process.env.PUBLIC_URL ?? 'http://127.0.0.1:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'onrepeat.fm',
  description: "the song you've got on repeat.",
  openGraph: {
    title: 'onrepeat.fm',
    description: "the song you've got on repeat.",
    siteName: 'onrepeat.fm',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
}

export default async function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  // The whole shell wears the viewer's color theme (logged-out → FALLBACK_THEME). The only
  // exceptions are other people's content, which re-themes its own subtree: feed cards via
  // <JamCardShell>'s per-author data-theme, and a profile page via <HtmlTheme> (which swaps
  // <html> to the owner's theme while open, then restores the viewer's theme on leave).
  const viewerTheme = await readViewerTheme()
  return (
    <html
      lang="en"
      data-theme={viewerTheme}
      className={`${mono.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <UiProviders>
          <ChromeGate nav={<SiteNav />} footer={<SiteFooter />}>
            {children}
          </ChromeGate>
          {modal}
          <PlayerHost />
        </UiProviders>
      </body>
    </html>
  )
}
