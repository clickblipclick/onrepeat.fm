import { redirect } from 'next/navigation'

import { linkInline } from '../../lib/link-variants'
import { getSession } from '../../lib/session'
import { LoginForm } from './login-form'

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

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-lg font-bold">Sign in</h1>
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
      <p className="mb-4 text-sm text-muted">
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
    </div>
  )
}
