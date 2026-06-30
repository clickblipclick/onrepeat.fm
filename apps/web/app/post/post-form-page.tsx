'use client'

import { useRouter } from 'next/navigation'

import { PostJamForm } from '@/app/post-jam-form'

/** Full-page host for the post form: on success, navigate to the home feed (replace so
 *  Back doesn't land on the now-empty form). The dirty guard is modal-only, so no
 *  onDirtyChange here. */
export function PostFormPage() {
  const router = useRouter()
  return <PostJamForm onSuccess={() => router.replace('/')} />
}
