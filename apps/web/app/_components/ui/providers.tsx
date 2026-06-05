'use client'

import { ToastProvider } from './toast'
import { ConfirmProvider } from './confirm'

/** Mounts the design-system providers (toasts + confirm/alert). Client component so it
 *  can be dropped into the server-rendered root layout around the app tree. */
export function UiProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  )
}
