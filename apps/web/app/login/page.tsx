import { redirect } from 'next/navigation'
import { getSession } from '../../lib/session'

export default async function LoginPage() {
  const session = await getSession()
  if (session.did) redirect('/')

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-lg font-bold">Sign in</h1>
      <p className="mb-4 text-sm text-muted">
        One song. Seven days. Sign in with Bluesky to follow people and set your jam.
      </p>
      <form action="/oauth/login" method="post" className="flex gap-2">
        <input
          name="handle"
          placeholder="you.bsky.social"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="username"
          required
          className="flex-1 rounded border border-border bg-bg px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-accent px-3 py-2 text-sm text-on-accent">Sign in</button>
      </form>
      <p className="mt-4 text-sm text-muted">
        New to Bluesky?{' '}
        <a href="https://bsky.app" target="_blank" rel="noreferrer" className="text-accent">
          Create an account →
        </a>
      </p>
    </div>
  )
}
