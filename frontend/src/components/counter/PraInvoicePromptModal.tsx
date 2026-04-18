import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { FileText, Receipt } from 'lucide-react'

type Props = {
  open: boolean
  /** Invoked when cashier chooses to skip the PRA invoice — the default, fastest path. */
  onSkip: () => void
  /** Invoked when cashier chooses to print the PRA tax invoice slip. */
  onPrint: () => void
  /** True while the PRA slip is rendering/printing; disables both buttons. */
  busy?: boolean
}

/**
 * Post-payment prompt that appears only when the PRA tax invoice feature is
 * enabled in Admin Settings. Default focus sits on Skip so a cashier who
 * doesn't need the extra slip can dismiss with Enter/Space immediately.
 *
 * Intentionally built as a lightweight dialog (same styling approach as
 * KotPrintModal) rather than pulling in Radix Dialog — the UX is two buttons
 * and we want zero focus-management surprises at the register.
 */
export function PraInvoicePromptModal({ open, onSkip, onPrint, busy = false }: Props) {
  const skipBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    // Focus Skip on open so Enter dismisses without any extra slip printing —
    // matches the "Skip is the fast path" UX decision.
    const id = window.setTimeout(() => skipBtnRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onSkip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onSkip])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pra-prompt-title"
    >
      <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Receipt className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 id="pra-prompt-title" className="text-lg font-semibold leading-tight">
              PRA tax invoice?
            </h2>
            <p className="text-muted-foreground text-sm mt-1.5">
              The customer receipt has already printed. Did the customer request a{' '}
              <strong>PRA tax invoice</strong>? If not, just skip — the order is already
              complete.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            ref={skipBtnRef}
            type="button"
            variant="outline"
            onClick={onSkip}
            disabled={busy}
            className="h-11 text-base"
          >
            Skip
          </Button>
          <Button
            type="button"
            onClick={onPrint}
            disabled={busy}
            className="h-11 text-base"
          >
            <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
            {busy ? 'Printing…' : 'Print PRA invoice'}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          Press <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-muted border border-border">Esc</kbd>{' '}
          or <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-muted border border-border">Enter</kbd>{' '}
          to skip.
        </p>
      </div>
    </div>
  )
}
