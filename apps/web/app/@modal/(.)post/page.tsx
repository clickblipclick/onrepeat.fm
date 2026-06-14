import { getSession } from '../../../lib/session'
import { PostModal } from '../../_components/post-modal'

// Intercepts a soft navigation to /post and renders it as a modal over the current page.
// A hard load / refresh / shared link skips this and hits app/post/page.tsx (full page).
export default async function PostModalRoute() {
  const session = await getSession()
  return <PostModal signedIn={Boolean(session.did)} />
}
