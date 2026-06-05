import Link from 'next/link'
import { getSession } from '../../lib/session'
import { PostJamForm } from '../post-jam-form'

export default async function PostPage() {
  const session = await getSession()
  if (!session.did) {
    return (
      <p>
        <Link href="/login" className="text-accent">
          Sign in
        </Link>{' '}
        to set your jam.
      </p>
    )
  }
  return (
    <>
      <h1 className="mb-4 text-sm text-muted uppercase">Set your jam</h1>
      <PostJamForm />
    </>
  )
}
