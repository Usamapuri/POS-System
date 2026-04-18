import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { FileText, Receipt } from 'lucide-react'

type Props = {
  open: boolean
  /** Invoked when cashier chooses to skip the PRA invoice (Escape). */
  onSkip: () => void
  /** Invoked when cashier chooses to print the PRA tax invoice slip (Enter). */
  onPrint: () => void
  /** True while the PRA slip is rendering/printing; disables both buttons. */
  busy?: boolean
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (TYPING_TAGS.has(target.tagName)) return true
  if (target.isContentEditable) return true
  return false
}

/**
 * Post-payment prompt that appears only when the PRA tax invoice feature is
 * enabled in Admin Settings.
 *
 * Keyboard shortcuts:
 *  • Enter  → Print PRA invoice (primary action, initial focus)
 *  • Escape → Skip
 *
 * We register the keydown listener with `{ capture: true }` on `document` so
 * this modal wins against global window-level hotkey handlers (e.g. the
 * counter's Escape-closes-checkout handler in `useCounterHotkeys`). We also
 * call `stopImmediatePropagation()` so those other listeners never see the
 * event while this modal is open.
 */
export function PraInvoicePromptModal({ open, onSkip, onPrint, busy = false }: Props) {
  const printBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    // Focus the PRINT button on open so Enter (the most common intent when
    // the cashier opened this prompt) fires the primary action.
    const id = window.setTimeout(() => printBtnRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // Escape always wins, even while typing — matches global counter UX.
      if (e.key === 'Escape') {
        if (busy) return
        e.preventDefault()
        e.stopPropagation()
        // stopImmediatePropagation prevents the counter's global window-level
        // Escape listener from also firing (which would close checkout).
        e.stopImmediatePropagation()
        onSkip()
        return
      }
      // Enter only triggers Print when the user isn't typing into an input.
      // (The cashier shouldn't hit this case since the modal has no inputs,
      // but this guards against edge cases where focus escapes.)
      if (e.key === 'Enter') {
        if (busy) return
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        onPrint()
        return
      }
    }
    // Capture phase + document target to run BEFORE any window-level hotkey
    // handlers (like useCounterHotkeys) that rely on the default bubbling
    // phase at window.
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [open, busy, onSkip, onPrint])

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
            type="button"
            variant="outline"
            onClick={onSkip}
            disabled={busy}
            className="h-11 text-base"
          >
            Skip
          </Button>
          <Button
            ref={printBtnRef}
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
          <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-muted border border-border">Enter</kbd>{' '}
          to print · <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-muted border border-border">Esc</kbd>{' '}
          to skip
        </p>
      </div>
    </div>
  )
}
