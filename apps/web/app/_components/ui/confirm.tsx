'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { Button } from './button'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}
export interface AlertOptions {
  title: string
  description?: string
  okText?: string
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  alert: (opts: AlertOptions) => Promise<void>
}
const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}

type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: AlertOptions; resolve: () => void }

/** Imperative confirm/alert on the native <dialog> (focus-trap, top-layer, Esc — all built in).
 *  Mount once near the app root; call via useConfirm(). */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const titleId = useId()
  const descId = useId()

  // Show only after the content has committed; guard against double-open.
  useEffect(() => {
    if (pending && ref.current && !ref.current.open) ref.current.showModal()
  }, [pending])

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) =>
        setPending({ kind: 'confirm', opts, resolve }),
      ),
    [],
  )
  const alert = useCallback(
    (opts: AlertOptions) =>
      new Promise<void>((resolve) =>
        setPending({ kind: 'alert', opts, resolve }),
      ),
    [],
  )

  // Settle the promise from returnValue whenever the dialog closes (button, Esc, backdrop).
  const handleClose = useCallback(() => {
    setPending((p) => {
      if (p?.kind === 'confirm')
        p.resolve(ref.current?.returnValue === 'confirm')
      else p?.resolve()
      return null
    })
  }, [])

  const settle = (value: string) => {
    if (!ref.current) return
    ref.current.returnValue = value
    ref.current.close()
  }

  // Backdrop-click light-dismiss. On browsers with `closedby="any"` (Chrome/Edge/FF)
  // the platform handles this (plus mobile back/dismiss); this stays as the Safari
  // fallback. Either path closes with a non-'confirm' returnValue → resolves false.
  const onClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) settle('cancel') // backdrop click
  }

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      <dialog
        ref={ref}
        role="alertdialog"
        closedby="any"
        aria-labelledby={titleId}
        aria-describedby={pending?.opts.description ? descId : undefined}
        onClose={handleClose}
        onClick={onClick}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-md border border-border bg-surface p-0 text-ink backdrop:bg-black/40"
      >
        {pending && (
          <div className="p-5">
            <h2 id={titleId} className="text-sm font-bold">
              {pending.opts.title}
            </h2>
            {pending.opts.description && (
              <p id={descId} className="mt-1 text-sm text-muted">
                {pending.opts.description}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {pending.kind === 'confirm' && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => settle('cancel')}
                >
                  {pending.opts.cancelText ?? 'Cancel'}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                autoFocus={pending.kind === 'alert'}
                variant={
                  pending.kind === 'confirm' && pending.opts.destructive
                    ? 'danger'
                    : 'primary'
                }
                onClick={() =>
                  settle(pending.kind === 'confirm' ? 'confirm' : 'ok')
                }
              >
                {pending.kind === 'confirm'
                  ? (pending.opts.confirmText ?? 'Confirm')
                  : (pending.opts.okText ?? 'OK')}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  )
}
