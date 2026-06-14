import Link from 'next/link'
import { getSession } from '../../lib/session'
import { linkInline } from '../../lib/link-variants'
import { PostFormPage } from './post-form-page'
import { SectionLabel } from '../_components/section-label'

export default async function PostPage() {
  const session = await getSession()
  if (!session.did) {
    return (
      <p>
        <Link href="/login" className={linkInline}>
          Sign in
        </Link>{' '}
        to post a song.
      </p>
    )
  }
  return (
    <>
      <SectionLabel as="h1" size="title">
        What&apos;s on repeat?
      </SectionLabel>
      <PostFormPage />
    </>
  )
}
