import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { DashboardOverview, MetricPair } from '@/types'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { formatTrendPercent, trendDirection } from './dashboardFormat'
import { cn } from '@/lib/utils'

interface RevenueProfitPanelProps {
  overview?: DashboardOverview
  isLoading: boolean
}

export function RevenueProfitPanel({ overview, isLoading }: RevenueProfitPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue & profit</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {isLoading || !overview ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-md" />)
        ) : (
          <>
            <ProfitRow label="Gross sales" pair={overview.gross_sales} polarity="positive" />
            <ProfitRow label="Discounts" pair={overview.discounts} polarity="negative" />
            <ProfitRow label="Tax collected" pair={overview.tax} polarity="positive" />
            <ProfitRow label="Expenses" pair={overview.expenses} polarity="negative" />
            <ProfitRow label="Net profit" pair={overview.net_profit} polarity="positive" emphasised />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ProfitRow({
  label,
  pair,
  polarity,
  emphasised,
}: {
  label: string
  pair: MetricPair
  polarity: 'positive' | 'negative'
  emphasised?: boolean
}) {
  const { formatCurrency } = useCurrency()
  const dir = trendDirection(pair.pct, polarity)
  const pct = formatTrendPercent(pair.pct)
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus

  const trendColor =
    dir === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : dir === 'down'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-muted-foreground'

  return (
    <div className={cn('rounded-md border p-3', emphasised && 'border-primary/30 bg-primary/5')}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tabular-nums', emphasised && 'text-primary')}>
        {formatCurrency(pair.current)}
      </div>
      <div className={cn('mt-0.5 inline-flex items-center gap-1 text-xs', trendColor)}>
        <Icon className="h-3 w-3" />
        <span>{pct ?? '—'}</span>
        <span className="text-muted-foreground">vs {formatCurrency(pair.previous)}</span>
      </div>
    </div>
  )
}
