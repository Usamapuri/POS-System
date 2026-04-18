import { Button } from '@/components/ui/button'
import type { DashboardPeriod } from '@/types'
import { cn } from '@/lib/utils'

interface PeriodSelectorProps {
  value: DashboardPeriod
  onChange: (period: DashboardPeriod) => void
  className?: string
}

// The period options shown to the user. Calendar-week (cw) and
// calendar-month (cm) are explicit so operators stop confusing them with the
// rolling 7d / 30d windows.
const PERIODS: { id: DashboardPeriod; label: string; hint: string }[] = [
  { id: 'today', label: 'Today', hint: 'T' },
  { id: 'yesterday', label: 'Yesterday', hint: 'Y' },
  { id: '7d', label: '7d', hint: 'rolling' },
  { id: '30d', label: '30d', hint: 'rolling' },
  { id: 'cw', label: 'This week', hint: 'Mon→Sun' },
  { id: 'cm', label: 'This month', hint: '1st→today' },
]

export function PeriodSelector({ value, onChange, className }: PeriodSelectorProps) {
  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-1', className)}>
      {PERIODS.map((p) => {
        const isActive = value === p.id
        return (
          <Button
            key={p.id}
            type="button"
            variant={isActive ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onChange(p.id)}
            className={cn(
              'h-8 px-3 text-xs font-medium',
              isActive && 'shadow-sm',
            )}
            title={p.hint}
            aria-pressed={isActive}
          >
            {p.label}
          </Button>
        )
      })}
    </div>
  )
}
