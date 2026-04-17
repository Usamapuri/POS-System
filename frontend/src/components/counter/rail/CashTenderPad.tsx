import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { DollarSign } from 'lucide-react'

export interface CashTenderPadProps {
  amountDue: number
  received: string
  onReceivedChange: (value: string) => void
  onCancel: () => void
  onComplete: () => void
  formatCurrency: (n: number) => string
  processing: boolean
}

function parseReceived(v: string): number {
  const n = parseFloat(v || '0')
  return Number.isFinite(n) ? n : 0
}

export function CashTenderPad({
  amountDue,
  received,
  onReceivedChange,
  onCancel,
  onComplete,
  formatCurrency,
  processing,
}: CashTenderPadProps) {
  const receivedNum = parseReceived(received)
  const change = Math.max(0, receivedNum - amountDue)
  const insufficient = receivedNum < amountDue

  const appendQuick = (extra: number) => {
    const next = Math.max(amountDue, receivedNum) + extra
    onReceivedChange(next.toFixed(2))
  }

  const setExact = () => {
    onReceivedChange(amountDue.toFixed(2))
  }

  const bumpTo = (value: number) => {
    if (value <= 0) return
    onReceivedChange(value.toFixed(2))
  }

  return (
    <section
      aria-labelledby="cash-tender-pad-heading"
      className="rounded-xl border border-emerald-400/50 bg-emerald-50/60 p-3 shadow-lg ring-1 ring-emerald-500/20 dark:border-emerald-800 dark:bg-emerald-950/30 dark:ring-emerald-400/10 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3
            id="cash-tender-pad-heading"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-emerald-900 dark:text-emerald-100"
          >
            <DollarSign className="h-4 w-4" aria-hidden />
            Cash tender
          </h3>
          <p className="mt-0.5 text-xs text-emerald-900/70 dark:text-emerald-100/70">
            Amount due <span className="font-semibold tabular-nums">{formatCurrency(amountDue)}</span>
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <Label className="text-xs font-medium text-emerald-900/80 dark:text-emerald-100/80">
            Amount received
          </Label>
          <Input
            inputMode="decimal"
            autoFocus
            className={cn(
              'mt-1 h-12 text-2xl font-bold tabular-nums',
              insufficient
                ? 'border-amber-400 focus-visible:ring-amber-300'
                : 'border-emerald-500/60 focus-visible:ring-emerald-300'
            )}
            value={received}
            onChange={(e) => onReceivedChange(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div className="grid grid-cols-4 gap-2 text-sm">
          <Button type="button" variant="outline" size="sm" onClick={setExact}>
            Exact
          </Button>
          {[5, 10, 20, 50].slice(0, 3).map((inc) => (
            <Button
              key={inc}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendQuick(inc)}
            >
              +{inc}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          {[100, 200, 500].map((v) => (
            <Button
              key={v}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => bumpTo(v)}
            >
              {v}
            </Button>
          ))}
        </div>

        <div
          className={cn(
            'flex items-center justify-between rounded-lg border px-3 py-2 text-lg font-semibold tabular-nums',
            insufficient
              ? 'border-amber-400 bg-amber-50/70 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200'
              : 'border-emerald-400/70 bg-white/80 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100'
          )}
        >
          <span className="text-sm font-medium">
            {insufficient ? 'Short by' : 'Change due'}
          </span>
          <span>
            {insufficient
              ? formatCurrency(Math.max(0, amountDue - receivedNum))
              : formatCurrency(change)}
          </span>
        </div>

        <Button
          type="button"
          className="h-12 w-full text-base font-semibold bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          disabled={insufficient || processing}
          onClick={onComplete}
        >
          {processing ? 'Completing…' : `Complete cash payment · ${formatCurrency(amountDue)}`}
        </Button>
      </div>
    </section>
  )
}
