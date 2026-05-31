import './globals.css'
import { JetBrains_Mono } from 'next/font/google'
import { SiteNav } from './_components/site-nav'

const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' })

export const metadata = { title: 'onrepeat.fm', description: 'one song. seven days.' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="clay" className={mono.variable}>
      <body className="min-h-screen">
        <SiteNav />
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
