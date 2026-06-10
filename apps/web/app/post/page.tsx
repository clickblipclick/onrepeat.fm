import Link from 'next/link'
import { getSession } from '../../lib/session'
import { linkInline } from '../../lib/link-variants'
import { PostJamForm } from '../post-jam-form'
import { SectionLabel } from '../_components/section-label'

export default async function PostPage() {
  const session = await getSession()
  if (!session.did) {
    return (
      <p>
        <Link href="/login" className={linkInline}>
          Sign in
        </Link>{' '}
        to set your jam.
      </p>
    )
  }
  return (
    <>
      <SectionLabel as="h1" size="title">
        Set your jam
      </SectionLabel>
      <PostJamForm />
    </>
  )
}
