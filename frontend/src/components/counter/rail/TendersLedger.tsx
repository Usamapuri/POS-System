import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Payment } from '@/types'

export interface TendersLedgerProps {
  payments: Payment[] | undefined | null
  totalAmount: number
  remaining: number
  formatCurrency: (n: number) => string
}

const methodLabel: Record<string, string> = {
  cash: 'Cash',
  credit_card: 'Card',
  debit_card: 'Card',
  online: 'Online',
}

export function TendersLedger({
  payments,
  totalAmount,
  remaining,
  formatCurrency,
}: TendersLedgerProps) {
  const completed = (payments ?? []).filter((p) => p.status === 'completed')
  const paid = completed.reduce((s, p) => s + p.amount, 0)
  const anyPayments = completed.length > 0
  if (!anyPayments && remaining >= totalAmount) return null

  return (
    <section
      aria-labelledby="tenders-ledger-heading"
      className="space-y-2 rounded-lg border border-border bg-muted/15 p-3"
    >
      <div className="flex items-center justify-between">
        <h3
          id="tenders-ledger-heading"
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Tenders applied
        </h3>
        <span
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wide',
            remaining <= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-violet-700 dark:text-violet-300'
          )}
        >
          {remaining <= 0 ? 'Fully paid' : `${formatCurrency(remaining)} remaining`}
        </span>
      </div>
      {anyPayments ? (
        <ul className="space-y-1.5">
          {completed.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-border/60 bg-card/70 px-2 py-1.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                <span className="font-medium">
                  {methodLabel[p.payment_method] ?? p.payment_method}
                </span>
                {p.reference_number && (
                  <span className="text-xs text-muted-foreground">· ref {p.reference_number}</span>
                )}
              </span>
              <span className="font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {anyPayments && (
        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
          <span className="text-muted-foreground">Paid so far</span>
          <span className="font-semibold tabular-nums">{formatCurrency(paid)}</span>
        </div>
      )}
    </section>
  )
}
