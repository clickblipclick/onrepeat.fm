import { getSession } from '../lib/session'
import { postJamAction } from './actions'

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
      <form action={async (fd) => { await postJamAction(fd) }}>
        <input name="sourceUrl" placeholder="https://open.spotify.com/track/..." />
        <input name="title" placeholder="Song title" />
        <input name="artist" placeholder="Artist" />
        <input name="caption" placeholder="why this song (optional)" />
        <button type="submit">Set as my jam</button>
      </form>
      <form action="/logout" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  )
}
