import Link from 'next/link'
import { getSession } from '../../lib/session'
import { readViewerTheme } from '../../lib/viewer-theme'
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
  // Dress the form in the poster's own color theme (matches the modal presentation).
  const theme = await readViewerTheme()
  return (
    <div data-theme={theme}>
      <SectionLabel as="h1" size="title">
        What&apos;s on repeat?
      </SectionLabel>
      <PostFormPage />
    </div>
  )
}
