import './globals.css'
import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
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

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  // No data-theme on the chrome: it uses the neutral `mono` default (globals.css :root).
  // Color themes apply only on profile pages and individual jam cards.
  return (
    <html lang="en" className={mono.variable}>
      <body className="min-h-screen">
        <UiProviders>
          <SiteNav />
          <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
          {modal}
        </UiProviders>
      </body>
    </html>
  )
}
