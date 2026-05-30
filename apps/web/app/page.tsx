import { getSession } from '../lib/session'
import { PostJamForm } from './post-jam-form'

export default async function Home() {
  const session = await getSession()
  if (!session.did) {
    return (
      <main>
        <h1>onrepeat.fm</h1>
        <form action="/login" method="post">
          <input name="handle" placeholder="you.bsky.social" />
          <button type="submit">Sign in with Bluesky</button>
        </form>
      </main>
    )
  }
  return (
    <main>
      <h1>onrepeat.fm</h1>
      <p>Signed in as {session.did}</p>
      <PostJamForm />
      <form action="/logout" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  )
}
