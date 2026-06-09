import './globals.css'
import { JetBrains_Mono } from 'next/font/google'
import { SiteNav } from './_components/site-nav'
import { UiProviders } from './_components/ui/providers'

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
})

export const metadata = {
  title: 'onrepeat.fm',
  description: 'one song. seven days.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No data-theme on the chrome: it uses the neutral `mono` default (globals.css :root).
  // Color themes apply only on profile pages and individual jam cards.
  return (
    <html lang="en" className={mono.variable}>
      <body className="min-h-screen">
        <UiProviders>
          <SiteNav />
          <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
        </UiProviders>
      </body>
    </html>
  )
}
