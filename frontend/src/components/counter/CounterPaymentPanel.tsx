import { Button } from '@/components/ui/button'
import { Check, CreditCard, DollarSign, Globe, X } from 'lucide-react'
import type { Order, OrderItem } from '@/types'
import type { computeCartTotals } from '@/lib/counterPricing'
import { cn } from '@/lib/utils'
import { TendersLedger } from '@/components/counter/rail/TendersLedger'
import { TenderInput, type TenderIntent } from '@/components/counter/rail/TenderInput'

export type CounterPaymentTotals = ReturnType<typeof computeCartTotals>

export type CounterPaymentPanelProps = {
  payOrder: Order
  paymentCheckoutIntent: TenderIntent
  onPaymentIntent: (intent: TenderIntent) => void
  paymentOrderFetching: boolean
  billableItems: OrderItem[]
  paymentTotals: CounterPaymentTotals | null
  formatCurrency: (amount: number) => string
  payAmount: number
  referenceNumber: string
  onReferenceNumberChange: (value: string) => void
  discountMode: 'amount' | 'percent'
  onDiscountModeChange: (mode: 'amount' | 'percent') => void
  discountValue: string
  onDiscountValueChange: (value: string) => void
  discountMutationPending: boolean
  onApplyDiscount: () => void
  processPaymentPending: boolean
  onPrimaryPay: () => void
  /**
   * Inline confirmation surfaced directly above the remaining-balance ledger
   * after a partial payment has been recorded. Replaces a floating toast that
   * would draw the operator's eye away from the payment rail.
   */
  partialPaymentBanner?: string | null
  onDismissPartialPaymentBanner?: () => void
}

export function CounterPaymentPanel({
  payOrder,
  paymentCheckoutIntent,
  onPaymentIntent,
  paymentOrderFetching,
  billableItems,
  paymentTotals,
  formatCurrency,
  payAmount,
  referenceNumber,
  onReferenceNumberChange,
  discountMode,
  onDiscountModeChange,
  discountValue,
  onDiscountValueChange,
  discountMutationPending,
  onApplyDiscount,
  processPaymentPending,
  onPrimaryPay,
  partialPaymentBanner,
  onDismissPartialPaymentBanner,
}: CounterPaymentPanelProps) {
  const payCtaClass =
    paymentCheckoutIntent === 'cash'
      ? 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
      : paymentCheckoutIntent === 'card'
        ? 'bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500'
        : 'bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500'

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-lg ring-1 ring-black/[0.04] dark:border-border dark:ring-white/[0.08] sm:p-4">
      {/* Items charged */}
      <section aria-labelledby="items-charged-heading" className="space-y-2">
        <h3
          id="items-charged-heading"
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Items charged
        </h3>
        {billableItems.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {paymentOrderFetching ? 'Loading line items…' : 'No billable line items.'}
          </p>
        ) : (
          <ul className="space-y-2 text-sm leading-snug">
            {billableItems.map((line) => (
              <li
                key={line.id}
                className="flex justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">
                    {line.product?.name ?? 'Item'}{' '}
                    <span className="font-normal text-muted-foreground">× {line.quantity}</span>
                  </div>
                  {line.special_instructions ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">{line.special_instructions}</div>
                  ) : null}
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(line.total_price)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bill totals */}
      <section aria-labelledby="bill-totals-heading" className="space-y-1.5 text-sm">
        <h3
          id="bill-totals-heading"
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Bill totals
        </h3>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium tabular-nums">{formatCurrency(payOrder.subtotal)}</span>
        </div>
        {payOrder.discount_amount > 0 && (
          <div className="flex justify-between gap-4 text-primary">
            <span>Discount</span>
            <span className="font-medium tabular-nums">−{formatCurrency(payOrder.discount_amount)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Service</span>
          <span className="font-medium tabular-nums">
            {formatCurrency(payOrder.service_charge_amount ?? paymentTotals?.service ?? 0)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">
            Tax ({paymentTotals ? (paymentTotals.taxRate * 100).toFixed(0) : '—'}%)
          </span>
          <span className="font-medium tabular-nums">{formatCurrency(payOrder.tax_amount)}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-bold tracking-tight">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(payOrder.total_amount)}</span>
        </div>
      </section>

      {partialPaymentBanner ? (
        <div
          role="status"
          aria-live="polite"
          className="counter-fired-chip flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-100"
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Payment recorded</div>
            <div className="text-xs text-emerald-900/80 dark:text-emerald-200/80">
              {partialPaymentBanner}
            </div>
          </div>
          {onDismissPartialPaymentBanner && (
            <button
              type="button"
              onClick={onDismissPartialPaymentBanner}
              aria-label="Dismiss payment confirmation"
              className="shrink-0 rounded p-0.5 text-emerald-900/70 transition-colors hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-200/70 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : null}

      <TendersLedger
        payments={payOrder.payments}
        totalAmount={payOrder.total_amount}
        remaining={payAmount}
        formatCurrency={formatCurrency}
      />

      <TenderInput
        intent={paymentCheckoutIntent}
        onIntent={onPaymentIntent}
        referenceNumber={referenceNumber}
        onReferenceNumberChange={onReferenceNumberChange}
        discountMode={discountMode}
        onDiscountModeChange={onDiscountModeChange}
        discountValue={discountValue}
        onDiscountValueChange={onDiscountValueChange}
        discountPending={discountMutationPending}
        onApplyDiscount={onApplyDiscount}
      />

      <Button
        type="button"
        className={cn(
          'h-12 w-full text-base font-semibold shadow-sm transition-colors sm:h-11 sm:text-[15px]',
          payCtaClass
        )}
        disabled={payAmount <= 0 || processPaymentPending}
        onClick={onPrimaryPay}
      >
        {paymentCheckoutIntent === 'cash' && (
          <>
            <DollarSign className="mr-2 h-4 w-4 shrink-0" />
            Charge {formatCurrency(payAmount)} — Cash
          </>
        )}
        {paymentCheckoutIntent === 'card' && (
          <>
            <CreditCard className="mr-2 h-4 w-4 shrink-0" />
            Charge {formatCurrency(payAmount)} — Card
          </>
        )}
        {paymentCheckoutIntent === 'online' && (
          <>
            <Globe className="mr-2 h-4 w-4 shrink-0" />
            Charge {formatCurrency(payAmount)} — Online
          </>
        )}
      </Button>
    </div>
  )
}
