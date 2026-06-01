import Link from 'next/link'
import { getSession } from '../../lib/session'
import { PostJamForm } from '../post-jam-form'

export default async function PostPage() {
  const session = await getSession()
  if (!session.did) {
    return (
      <p>
        <Link href="/" className="text-accent">Sign in on the home page</Link> to set your jam.
      </p>
    )
  }
  return (
    <>
      <h1 className="mb-4 text-sm uppercase text-muted">Set your jam</h1>
      <PostJamForm />
    </>
  )
}
