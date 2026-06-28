import Link from 'next/link'
import { redirect } from 'next/navigation'

import { linkInline } from '../../lib/link-variants'
import { pickLoginTheme } from '../../lib/login-theme'
import { getSession } from '../../lib/session'
import { LoginForm } from './login-form'
import { RepeatRings } from './repeat-rings'

const LOGIN_ERRORS: Record<string, string> = {
  handle: "Couldn't sign in with that handle — double-check it and try again.",
  auth: "Sign-in didn't complete — please try again.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; error?: string }>
}) {
  const session = await getSession()
  if (session.did) redirect('/')
  const { expired, error } = await searchParams
  const errorMsg = error
    ? (LOGIN_ERRORS[error] ??
      'Something went wrong signing in — please try again.')
    : null

  // Re-rolled per request (this page is dynamic — it reads the session cookie), so the
  // accent (ring arc, Sign in button, input focus ring) varies on each visit. Scoped to
  // this subtree so the rest of the app chrome stays neutral mono.
  const theme = pickLoginTheme()

  return (
    <div data-theme={theme} className="w-full max-w-sm">
      <RepeatRings />
      <h1 className="mb-2 text-center text-lg font-bold">
        Sign in to onrepeat
      </h1>
      {expired && (
        <p className="mb-4 rounded border border-accent bg-surface px-3 py-2 text-sm text-accent">
          Your session expired — please sign in again.
        </p>
      )}
      {errorMsg && (
        <p className="mb-4 rounded border border-red-600 bg-surface px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </p>
      )}
      <p className="mb-4 text-center text-sm text-muted">
        The song you&apos;ve got on repeat. Sign in with Bluesky to follow
        people and post a song.
      </p>
      <LoginForm />
      <p className="mt-4 text-sm text-muted">
        New to Bluesky?{' '}
        <a
          href="https://bsky.app"
          target="_blank"
          rel="noreferrer"
          className={linkInline}
        >
          Create an account →
        </a>
      </p>
      <p className="mt-6 text-xs text-muted">
        <Link href="/terms" className="hover:text-accent">
          Terms
        </Link>
        {' · '}
        <Link href="/privacy" className="hover:text-accent">
          Privacy
        </Link>
      </p>
    </div>
  )
}
