import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CreditCard, DollarSign, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TenderIntent = 'cash' | 'card' | 'online'

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

export interface TenderInputProps {
  intent: TenderIntent
  onIntent: (i: TenderIntent) => void
  referenceNumber: string
  onReferenceNumberChange: (v: string) => void
  discountMode: 'amount' | 'percent'
  onDiscountModeChange: (mode: 'amount' | 'percent') => void
  discountValue: string
  onDiscountValueChange: (v: string) => void
  discountPending: boolean
  onApplyDiscount: () => void
}

export function TenderInput({
  intent,
  onIntent,
  referenceNumber,
  onReferenceNumberChange,
  discountMode,
  onDiscountModeChange,
  discountValue,
  onDiscountValueChange,
  discountPending,
  onApplyDiscount,
}: TenderInputProps) {
  return (
    <section
      aria-labelledby="tender-input-heading"
      className="space-y-3 rounded-lg border border-border bg-card/50 p-3"
    >
      <div>
        <h3
          id="tender-input-heading"
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Method
        </h3>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(['cash', 'card', 'online'] as const).map((key) => {
            const meta = intentMeta[key]
            const Icon = meta.Icon
            const on = intent === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => onIntent(key)}
                className={cn(
                  'flex h-11 flex-col items-center justify-center gap-0 rounded-lg border px-1 text-[11px] font-semibold uppercase tracking-wide transition-colors sm:h-12 sm:text-xs',
                  on ? meta.active : meta.idle
                )}
                aria-pressed={on}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Discount (counter)
        </Label>
        <div className="flex flex-wrap gap-2">
          <div className="grid shrink-0 grid-cols-2 gap-1">
            <Button
              type="button"
              size="sm"
              variant={discountMode === 'amount' ? 'default' : 'outline'}
              className="h-9 px-2 text-sm"
              onClick={() => onDiscountModeChange('amount')}
              aria-pressed={discountMode === 'amount'}
            >
              $
            </Button>
            <Button
              type="button"
              size="sm"
              variant={discountMode === 'percent' ? 'default' : 'outline'}
              className="h-9 px-2 text-sm"
              onClick={() => onDiscountModeChange('percent')}
              aria-pressed={discountMode === 'percent'}
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
            disabled={discountPending}
            onClick={onApplyDiscount}
          >
            Apply
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Enter 0 and apply to clear discount.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Reference (card / online optional)
        </Label>
        <Input
          className="h-10 text-sm"
          value={referenceNumber}
          onChange={(e) => onReferenceNumberChange(e.target.value)}
          placeholder="Txn / ref / Easypass id"
        />
      </div>
    </section>
  )
}
