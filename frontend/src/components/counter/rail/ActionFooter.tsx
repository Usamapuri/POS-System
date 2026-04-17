import { Button } from '@/components/ui/button'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ActionFooterTotals {
  subtotal: number
  service: number
  tax: number
  taxRate: number
  total: number
  discount?: number
}

export type ActionFooterMode = 'idle' | 'compose' | 'checkout'

export interface ActionFooterProps {
  mode: ActionFooterMode
  totals: ActionFooterTotals | null
  formatCurrency: (n: number) => string
  /** Label for the primary CTA (compose mode). */
  primaryLabel: string
  onPrimary?: () => void
  primaryDisabled?: boolean
  primaryPending?: boolean
  /** Message shown under totals when action is disabled (e.g. “Select a table first”). */
  disabledHint?: string
  /** Shown in checkout mode as a secondary row (the primary Charge CTA lives in the payment panel for color accuracy). */
  onCloseCheckout?: () => void
  /** When the bottom CTA must not render (e.g. no cart and no session). */
  hidePrimary?: boolean
}

export function ActionFooter({
  mode,
  totals,
  formatCurrency,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryPending,
  disabledHint,
  onCloseCheckout,
  hidePrimary,
}: ActionFooterProps) {
  if (mode === 'idle') {
    return (
      <div className="border-t border-border/80 bg-card/95 px-4 py-3 text-xs text-muted-foreground sm:px-5">
        {disabledHint ?? 'Pick a table or order type to begin.'}
      </div>
    )
  }

  const showTotals = totals !== null

  return (
    <div
      role="group"
      aria-label="Ticket actions"
      className="space-y-3 border-t border-border/90 bg-card/95 px-4 py-3 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-card/85 dark:shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.45)] sm:px-5 sm:py-4"
    >
      {showTotals && (
        <div className="space-y-1 text-sm leading-relaxed">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium tabular-nums">{formatCurrency(totals!.subtotal)}</span>
          </div>
          {typeof totals!.discount === 'number' && totals!.discount > 0 && (
            <div className="flex justify-between gap-4 text-primary">
              <span>Discount</span>
              <span className="font-medium tabular-nums">−{formatCurrency(totals!.discount)}</span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Service</span>
            <span className="font-medium tabular-nums">{formatCurrency(totals!.service)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              Tax ({(totals!.taxRate * 100).toFixed(0)}%)
            </span>
            <span className="font-medium tabular-nums">{formatCurrency(totals!.tax)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold tracking-tight sm:text-lg">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(totals!.total)}</span>
          </div>
        </div>
      )}

      {mode === 'compose' && !hidePrimary && (
        <Button
          type="button"
          className={cn('h-12 w-full text-base font-semibold sm:h-14 sm:text-lg')}
          disabled={primaryDisabled || primaryPending}
          onClick={onPrimary}
        >
          {primaryPending ? (
            'Sending…'
          ) : (
            <>
              <Check className="mr-2 h-5 w-5" />
              {primaryLabel}
            </>
          )}
        </Button>
      )}

      {mode === 'checkout' && onCloseCheckout && (
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={onCloseCheckout}
        >
          <X className="mr-2 h-4 w-4" />
          Close checkout
        </Button>
      )}

      {disabledHint && (
        <p className="text-[11px] text-muted-foreground text-center">{disabledHint}</p>
      )}
    </div>
  )
}
