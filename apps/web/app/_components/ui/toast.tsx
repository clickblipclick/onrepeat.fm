'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

import { cn } from '../../../lib/cn'

export type ToastVariant = 'default' | 'success' | 'error'
export interface ToastInput {
  title: string
  description?: string
  variant?: ToastVariant
  durationMs?: number
}
type ToastItem = ToastInput & { id: string }

interface ToastContextValue {
  toast: (t: ToastInput) => void
}
const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])

  const toast = useCallback(
    (t: ToastInput) => {
      const id = `toast-${seq.current++}`
      setItems((xs) => [...xs, { ...t, id }])
      setTimeout(() => dismiss(id), t.durationMs ?? 4000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Live region: errors announce assertively (role=alert), others politely. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.variant === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto w-full max-w-sm rounded-md border border-border bg-surface px-4 py-3 shadow-lg"
          >
            <div className="flex items-start gap-3">
              {t.variant && t.variant !== 'default' && (
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    t.variant === 'success' ? 'bg-green-600' : 'bg-red-600',
                  )}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">{t.title}</div>
                {t.description && (
                  <div className="mt-0.5 text-xs text-muted">
                    {t.description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 text-muted hover:text-ink"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
