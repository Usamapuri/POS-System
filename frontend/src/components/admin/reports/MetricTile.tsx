import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { MetricPair, IntMetricPair } from '@/types'

interface MetricTileProps {
  label: string
  metric: MetricPair | IntMetricPair
  /** Renderer for the *current* value (e.g. formatCurrency or formatNumber). */
  formatValue: (value: number) => string
  /** Renderer for the *previous* value shown in the comparison label. */
  formatPrevious?: (value: number) => string
  /** Optional human label for the comparison window (e.g. "vs. last 7 days"). */
  comparisonLabel: string
  icon?: React.ReactNode
  /** When true, downward deltas read as positive (e.g. for "Discounts"). */
  invertColors?: boolean
}

/**
 * KPI tile with a real period-over-period delta. Replaces the hardcoded
 * "+12.5%" Growth Rate card from the legacy reports page.
 *
 * Color semantics:
 *   - Up vs. previous: green (good for revenue/orders, can be inverted for
 *     discount-style metrics where a decrease is the win).
 *   - Down: red.
 *   - Equal: neutral.
 *   - Previous = 0 (delta has no sensible percentage): we render a single
 *     baseline label "no comparison" rather than misleading +∞%.
 */
export function MetricTile({
  label,
  metric,
  formatValue,
  formatPrevious,
  comparisonLabel,
  icon,
  invertColors = false,
}: MetricTileProps) {
  const formatPrev = formatPrevious ?? formatValue
  const hasPct = metric.pct != null
  const isUp = metric.delta > 0
  const isFlat = metric.delta === 0

  let toneClass = 'text-muted-foreground'
  let DirectionIcon = Minus
  if (!isFlat) {
    DirectionIcon = isUp ? ArrowUp : ArrowDown
    const goodWhenUp = !invertColors
    const isGood = (isUp && goodWhenUp) || (!isUp && !goodWhenUp)
    toneClass = isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
  }

  const pctText = hasPct
    ? `${metric.pct! > 0 ? '+' : ''}${metric.pct!.toFixed(1)}%`
    : '—'

  return (
    <Card>
      <CardContent className="p-5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <p className="text-2xl font-semibold tabular-nums">{formatValue(metric.current)}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-md bg-muted',
              toneClass,
            )}
          >
            <DirectionIcon className="w-3 h-3" />
            {pctText}
          </span>
          <span className="text-xs text-muted-foreground">
            {hasPct ? `${comparisonLabel} (${formatPrev(metric.previous)})` : comparisonLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
