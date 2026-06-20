import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/10">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted">
        <span>© Hey Ben, LLC</span>
        <nav className="flex items-center gap-3">
          <Link href="/terms" className="hover:text-accent">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-accent">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  )
}
