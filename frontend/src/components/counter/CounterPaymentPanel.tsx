import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CreditCard, DollarSign, Globe } from 'lucide-react'
import type { Order, OrderItem } from '@/types'
import type { computeCartTotals } from '@/lib/counterPricing'
import { cn } from '@/lib/utils'

export type CounterPaymentTotals = ReturnType<typeof computeCartTotals>

export type CounterPaymentPanelProps = {
  payOrder: Order
  paymentCheckoutIntent: 'cash' | 'card' | 'online'
  onPaymentIntent: (intent: 'cash' | 'card' | 'online') => void
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
}

const intentMeta = {
  cash: {
    label: 'Cash',
    Icon: DollarSign,
    active:
      'border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-900/20 ring-1 ring-emerald-500/30',
    idle:
      'border-emerald-200 bg-emerald-50/80 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-50 dark:hover:bg-emerald-900/50',
  },
  card: {
    label: 'Card',
    Icon: CreditCard,
    active:
      'border-sky-600 bg-sky-600 text-white shadow-sm shadow-sky-900/20 ring-1 ring-sky-400/35',
    idle:
      'border-sky-200 bg-sky-50/80 text-sky-950 hover:border-sky-300 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-50 dark:hover:bg-sky-900/50',
  },
  online: {
    label: 'Online',
    Icon: Globe,
    active:
      'border-violet-600 bg-violet-600 text-white shadow-sm shadow-violet-900/25 ring-1 ring-violet-400/35',
    idle:
      'border-violet-200 bg-violet-50/85 text-violet-950 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-50 dark:hover:bg-violet-900/50',
  },
} as const

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
}: CounterPaymentPanelProps) {
  const payCtaClass =
    paymentCheckoutIntent === 'cash'
      ? 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
      : paymentCheckoutIntent === 'card'
        ? 'bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500'
        : 'bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500'

  return (
    <div className="flex flex-col rounded-xl border border-border/80 bg-card shadow-lg ring-1 ring-black/[0.04] dark:border-border dark:ring-white/[0.08]">
      <div className="space-y-2.5 border-b border-border bg-gradient-to-b from-muted/50 to-card px-3.5 py-3 sm:px-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bill</div>
          <div className="text-base font-semibold tracking-tight sm:text-lg">
            Order #{payOrder.order_number}
          </div>
          {payOrder.table?.table_number && (
            <div className="mt-0.5 text-sm text-muted-foreground">Table {payOrder.table.table_number}</div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          {(['cash', 'card', 'online'] as const).map((key) => {
            const meta = intentMeta[key]
            const Icon = meta.Icon
            const on = paymentCheckoutIntent === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPaymentIntent(key)}
                className={cn(
                  'flex h-11 flex-col items-center justify-center gap-0 rounded-lg border px-1 text-[11px] font-semibold uppercase tracking-wide transition-colors sm:h-12 sm:text-xs',
                  on ? meta.active : meta.idle
                )}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-b border-border px-3.5 py-3 sm:px-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items charged</div>
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
      </div>

      <div className="space-y-2 border-b border-border px-3.5 py-3 text-sm leading-relaxed sm:px-4">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium tabular-nums">{formatCurrency(payOrder.subtotal)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Discount</span>
          <span className="font-medium tabular-nums">-{formatCurrency(payOrder.discount_amount)}</span>
        </div>
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

        <div className="space-y-2 pt-1">
          <Label className="text-xs font-medium text-muted-foreground">Discount (counter)</Label>
          <div className="flex flex-wrap gap-2">
            <div className="grid shrink-0 grid-cols-2 gap-1">
              <Button
                type="button"
                size="sm"
                variant={discountMode === 'amount' ? 'default' : 'outline'}
                className="h-9 px-2 text-sm"
                onClick={() => onDiscountModeChange('amount')}
              >
                $
              </Button>
              <Button
                type="button"
                size="sm"
                variant={discountMode === 'percent' ? 'default' : 'outline'}
                className="h-9 px-2 text-sm"
                onClick={() => onDiscountModeChange('percent')}
              >
                %
              </Button>
            </div>
            <Input
              inputMode="decimal"
              className="h-9 min-w-[6rem] flex-1 text-sm"
              placeholder={discountMode === 'percent' ? 'e.g. 10' : '0.00'}
              value={discountValue}
              onChange={(e) => onDiscountValueChange(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 shrink-0 px-3 text-sm"
              disabled={discountMutationPending}
              onClick={onApplyDiscount}
            >
              Apply
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Enter 0 and apply to clear discount.</p>
        </div>
      </div>

      <div className="space-y-2 px-3.5 py-3 sm:px-4">
        <Label className="text-xs font-medium text-muted-foreground">Reference (card / online optional)</Label>
        <Input
          className="h-10 text-sm"
          value={referenceNumber}
          onChange={(e) => onReferenceNumberChange(e.target.value)}
          placeholder="Txn / ref / Easypass id"
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
              Pay {formatCurrency(payAmount)} — Cash
            </>
          )}
          {paymentCheckoutIntent === 'card' && (
            <>
              <CreditCard className="mr-2 h-4 w-4 shrink-0" />
              Pay {formatCurrency(payAmount)} — Card
            </>
          )}
          {paymentCheckoutIntent === 'online' && (
            <>
              <Globe className="mr-2 h-4 w-4 shrink-0" />
              Pay {formatCurrency(payAmount)} — Online
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
