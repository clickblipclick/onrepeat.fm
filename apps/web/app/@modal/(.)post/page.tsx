import { PostModal } from '@/app/_components/post-modal'
import { getSession } from '@/lib/session'
import { readViewerTheme } from '@/lib/viewer-theme'

// Intercepts a soft navigation to /post and renders it as a modal over the current page.
// A hard load / refresh / shared link skips this and hits app/post/page.tsx (full page).
export default async function PostModalRoute() {
  const session = await getSession()
  // Dress the modal in the poster's own color theme (the chrome is otherwise neutral).
  const theme = session.did ? await readViewerTheme() : undefined
  return <PostModal signedIn={Boolean(session.did)} theme={theme} />
}
