'use client'

import { X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { ThemeName } from '@onrepeat/core'

import { PostJamForm } from '@/app/post-jam-form'
import { linkInline } from '@/lib/link-variants'

import { Button } from './ui/button'
import { useConfirm } from './ui/confirm'

/** Intercepting-route host for the post form. Renders the form inside a top-layer
 *  native <dialog>; all dismissal paths (Esc, backdrop, X) run a discard guard when the
 *  form is dirty, then router.back() to pop the intercepted route and reveal the feed
 *  (already revalidated by postJamAction) behind it. */
export function PostModal({
  signedIn,
  theme,
}: {
  signedIn: boolean
  theme?: ThemeName
}) {
  const router = useRouter()
  const { confirm } = useConfirm()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [dirty, setDirty] = useState(false)

  // Open as a modal once mounted (top layer + focus trap from the platform).
  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open)
      dialogRef.current.showModal()
  }, [])

  // Single dismissal funnel: guard when dirty, then pop the intercepted route.
  const requestClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard this post?',
        confirmText: 'Discard',
        cancelText: 'Keep editing',
        destructive: true,
      })
      if (!ok) return
    }
    router.back()
  }

  // Esc (and platform light-dismiss) fire onCancel — stop the native close so the guard runs.
  const onCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault()
    void requestClose()
  }

  // Backdrop click: only when the click lands on the dialog element itself (desktop card
  // has a ::backdrop; the full-screen mobile sheet has none, so this simply never fires there).
  const onClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) void requestClose()
  }

  return (
    <dialog
      ref={dialogRef}
      data-theme={theme}
      aria-labelledby="post-modal-title"
      onCancel={onCancel}
      onClick={onClick}
      className="post-modal m-auto w-[calc(100%-2rem)] max-w-2xl rounded-md border border-border bg-surface p-0 text-ink backdrop:bg-black/40 max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none"
    >
      <div className="flex max-h-[85dvh] flex-col max-sm:h-full max-sm:max-h-none">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="post-modal-title" className="text-xl font-bold">
            What&apos;s on repeat?
          </h2>
          <Button
            type="button"
            variant="link"
            size="icon"
            onClick={() => void requestClose()}
            aria-label="Close"
            className="-mr-2"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="overflow-y-auto p-6">
          {signedIn ? (
            <PostJamForm
              onSuccess={() => router.back()}
              onDirtyChange={setDirty}
            />
          ) : (
            <p>
              <Link href="/login" className={linkInline}>
                Sign in
              </Link>{' '}
              to post a song.
            </p>
          )}
        </div>
      </div>
    </dialog>
  )
}
