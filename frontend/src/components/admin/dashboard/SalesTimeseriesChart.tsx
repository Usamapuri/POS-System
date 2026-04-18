import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { SalesTimeseries } from '@/types'
import { compactCurrency } from './dashboardFormat'

interface SalesTimeseriesChartProps {
  data?: SalesTimeseries
  isLoading: boolean
  /** Pretty label for the prior period in tooltips/legend (e.g. "Yesterday"). */
  priorLabel?: string
}

interface ChartPoint {
  label: string
  current: number | null
  prior: number | null
}

export function SalesTimeseriesChart({ data, isLoading, priorLabel = 'Prior period' }: SalesTimeseriesChartProps) {
  const { formatCurrency, currencyCode } = useCurrency()

  const chartData: ChartPoint[] = useMemo(() => {
    if (!data) return []
    // Align prior series to current by index (both densified server-side).
    const len = Math.max(data.current.length, data.prior.length)
    const out: ChartPoint[] = []
    for (let i = 0; i < len; i++) {
      const cur = data.current[i]
      const pri = data.prior[i]
      out.push({
        label: cur?.label ?? pri?.label ?? '',
        current: cur ? cur.net : null,
        prior: pri ? pri.net : null,
      })
    }
    return out
  }, [data])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Net sales over time</CardTitle>
          <span className="text-xs text-muted-foreground">
            {data?.granularity === 'hour'
              ? 'Hourly buckets'
              : data?.granularity === 'month'
                ? 'Monthly buckets'
                : 'Daily buckets'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : !data || data.current.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            No sales recorded for this period yet.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashSalesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tickFormatter={(v: number) => compactCurrency(v, currencyCode)}
                />
                <ReTooltip
                  cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }}
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    color: 'hsl(var(--popover-foreground))',
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
                <Area
                  type="monotone"
                  dataKey="current"
                  name="This period"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#dashSalesFill)"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="prior"
                  name={priorLabel}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
