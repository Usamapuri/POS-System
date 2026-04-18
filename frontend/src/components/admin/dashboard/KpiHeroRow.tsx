import { useCurrency } from '@/contexts/CurrencyContext'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowDownRight, ArrowUpRight, Minus, Receipt, ShoppingCart, Users, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DashboardOverview, IntMetricPair, MetricPair } from '@/types'
import {
  compactCurrency,
  formatCount,
  formatTrendPercent,
  trendDirection,
  type TrendDirection,
} from './dashboardFormat'
import { cn } from '@/lib/utils'

interface KpiHeroRowProps {
  overview?: DashboardOverview
  isLoading: boolean
  previousLabel?: string
}

// Order chosen so the highest-signal metric (Net Sales) sits first.
export function KpiHeroRow({ overview, isLoading, previousLabel }: KpiHeroRowProps) {
  const { formatCurrency, currencyCode } = useCurrency()

  if (isLoading || !overview) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
    )
  }

  const tiles: KpiTileProps[] = [
    {
      label: 'Net Sales',
      icon: Wallet,
      iconClassName: 'text-emerald-600',
      value: compactCurrency(overview.net_sales.current, currencyCode),
      tooltip: formatCurrency(overview.net_sales.current),
      previous: formatCurrency(overview.net_sales.previous),
      pair: overview.net_sales,
      polarity: 'positive',
    },
    {
      label: 'Orders',
      icon: ShoppingCart,
      iconClassName: 'text-blue-600',
      value: formatCount(overview.orders.current),
      tooltip: `${formatCount(overview.orders.current)} completed (out of ${formatCount(
        overview.orders_placed.current,
      )} placed)`,
      previous: `${formatCount(overview.orders.previous)} prior`,
      pair: overview.orders,
      polarity: 'positive',
    },
    {
      label: 'Avg Ticket',
      icon: Receipt,
      iconClassName: 'text-violet-600',
      value: compactCurrency(overview.avg_ticket.current, currencyCode),
      tooltip: formatCurrency(overview.avg_ticket.current),
      previous: formatCurrency(overview.avg_ticket.previous),
      pair: overview.avg_ticket,
      polarity: 'positive',
    },
    {
      label: 'Covers',
      icon: Users,
      iconClassName: 'text-amber-600',
      value: formatCount(overview.covers.current),
      tooltip: `${formatCount(overview.covers.current)} guests served`,
      previous: `${formatCount(overview.covers.previous)} prior`,
      pair: overview.covers,
      polarity: 'positive',
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <KpiTile key={t.label} {...t} previousLabel={previousLabel} />
      ))}
    </div>
  )
}

interface KpiTileProps {
  label: string
  icon: LucideIcon
  iconClassName?: string
  value: string
  /** Full-precision value shown on hover. */
  tooltip?: string
  previous: string
  pair: MetricPair | IntMetricPair
  polarity?: 'positive' | 'negative'
  previousLabel?: string
}

function KpiTile({ label, icon: Icon, iconClassName, value, tooltip, previous, pair, polarity = 'positive', previousLabel }: KpiTileProps) {
  const dir = trendDirection(pair.pct, polarity)
  const pctText = formatTrendPercent(pair.pct)
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <Icon className={cn('h-4 w-4', iconClassName)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-3xl font-semibold leading-none tracking-tight" title={tooltip}>
            {value}
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendBadge direction={dir} text={pctText ?? '—'} />
            <span className="truncate">
              vs {previous}
              {previousLabel ? ` (${previousLabel})` : ''}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const TREND_STYLES: Record<TrendDirection, { className: string; Icon: LucideIcon }> = {
  up: {
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
    Icon: ArrowUpRight,
  },
  down: {
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
    Icon: ArrowDownRight,
  },
  flat: {
    className: 'border-muted-foreground/20 bg-muted text-muted-foreground',
    Icon: Minus,
  },
  unknown: {
    className: 'border-muted-foreground/20 bg-muted text-muted-foreground',
    Icon: Minus,
  },
}

function TrendBadge({ direction, text }: { direction: TrendDirection; text: string }) {
  const { className, Icon } = TREND_STYLES[direction]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold', className)}>
      <Icon className="h-3 w-3" />
      {text}
    </span>
  )
}

function KpiSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4 rounded" />
        </div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}
