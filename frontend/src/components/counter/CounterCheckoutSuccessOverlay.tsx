import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CheckoutCelebrationMode = 'dine_in' | 'takeout' | 'delivery'

type Props = {
  mode: CheckoutCelebrationMode
  /** Auto-dismiss after this many ms (default 2200). */
  autoDismissMs?: number
  onDismiss: () => void
}

function copyForMode(mode: CheckoutCelebrationMode): { headline: string; sub: string } {
  switch (mode) {
    case 'dine_in':
      return {
        headline: 'Thank you',
        sub: 'Your visit is complete. We hope to see you again soon.',
      }
    case 'delivery':
      return {
        headline: 'Thank you',
        sub: 'Payment received — your order is on its way.',
      }
    default:
      return {
        headline: 'Thank you',
        sub: 'Payment received — we’ll have your order ready shortly.',
      }
  }
}

export function CounterCheckoutSuccessOverlay({
  mode,
  autoDismissMs = 2200,
  onDismiss,
}: Props) {
  const { headline, sub } = copyForMode(mode)

  const dismiss = useCallback(() => {
    onDismiss()
  }, [onDismiss])

  useEffect(() => {
    const t = window.setTimeout(dismiss, autoDismissMs)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [dismiss, autoDismissMs])

  if (typeof document === 'undefined') return null

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="counter-checkout-success-title"
      aria-describedby="counter-checkout-success-desc"
      className={cn(
        'fixed inset-0 z-[200] flex touch-manipulation items-center justify-center p-4 sm:p-8',
        'counter-checkout-success-backdrop bg-gradient-to-b from-slate-950/88 via-slate-900/90 to-slate-950/95 backdrop-blur-[3px]'
      )}
      onClick={dismiss}
    >
      <div
        className={cn(
          'relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-card text-card-foreground shadow-[0_25px_80px_-12px_rgba(0,0,0,0.45)]',
          'counter-checkout-success-card'
        )}
        onClick={dismiss}
      >
        {/* Ambient accents (customer-facing polish, no external assets) */}
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-sky-500/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl"
          aria-hidden
        />

        <div className="relative px-8 pb-6 pt-10 text-center sm:px-12 sm:pb-8 sm:pt-12">
          <div
            className="counter-checkout-success-icon mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 shadow-lg shadow-emerald-900/25 ring-4 ring-white/10 dark:ring-white/5"
            aria-hidden
          >
            <Check className="h-12 w-12 text-white drop-shadow-sm" strokeWidth={2.5} />
          </div>

          <h2
            id="counter-checkout-success-title"
            className="text-balance font-semibold tracking-tight text-foreground text-3xl sm:text-4xl"
          >
            {headline}
          </h2>
          <p
            id="counter-checkout-success-desc"
            className="mx-auto mt-4 max-w-md text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            {sub}
          </p>

          <p className="mt-10 text-sm font-medium text-muted-foreground/90">
            Tap anywhere to continue
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">This screen closes automatically</p>
        </div>

        <div className="h-1 w-full bg-muted/60">
          <div
            className="counter-checkout-success-progress h-full origin-left rounded-r-full bg-gradient-to-r from-emerald-500 to-teal-500"
            style={{ animationDuration: `${autoDismissMs}ms` }}
            aria-hidden
          />
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
