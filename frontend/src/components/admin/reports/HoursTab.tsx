import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import apiClient from '@/api/client'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { UseReportRange } from '@/hooks/useReportRange'
import type { HourlyHeatmapCell } from '@/types'
import { ExportButton } from './ExportButton'
import { ReportsExportSlot } from './ReportsExportSlot'
import { openPrintableReport, escapeHtml } from '@/lib/printReport'
import { useBusinessNameWithFallback } from '@/hooks/useBusinessName'
import { cn, formatDateDDMMYYYY } from '@/lib/utils'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => h)

type Metric = 'net' | 'orders'

interface Props {
  range: UseReportRange
}

export function HoursTab({ range }: Props) {
  const { formatCurrency } = useCurrency()
  const [metric, setMetric] = useState<Metric>('net')

  const hourlyQuery = useQuery({
    queryKey: ['reports-v2', 'hourly', range.fromISO, range.toISO],
    queryFn: () => apiClient.getHourlySalesReport(range.fromISO, range.toISO),
    staleTime: 30_000,
  })

  const data = hourlyQuery.data?.data
  const series = data?.series ?? []
  const heatmap = data?.heatmap ?? []

  // Heatmap matrix [dow][hour]
  const matrix = useMemo(() => {
    const m: HourlyHeatmapCell[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ dow: 0, hour: 0, orders: 0, net: 0 })),
    )
    heatmap.forEach((cell) => {
      if (m[cell.dow] && m[cell.dow][cell.hour]) {
        m[cell.dow][cell.hour] = cell
      }
    })
    return m
  }, [heatmap])

  const max = useMemo(() => {
    let v = 0
    heatmap.forEach((c) => {
      const x = metric === 'net' ? c.net : c.orders
      if (x > v) v = x
    })
    return v
  }, [heatmap, metric])

  const peak = useMemo<HourlyHeatmapCell | null>(() => {
    let bestCell: HourlyHeatmapCell | null = null
    let bestValue = -1
    heatmap.forEach((c) => {
      const value = metric === 'net' ? c.net : c.orders
      if (value > bestValue) {
        bestValue = value
        bestCell = c
      }
    })
    return bestCell
  }, [heatmap, metric])

  const formatMetricValue = (v: number) => (metric === 'net' ? formatCurrency(v) : v.toLocaleString('en-US'))

  const brand = useBusinessNameWithFallback()
  const handlePrintPdf = () => {
    openPrintableReport({
      title: 'Hourly Sales',
      subtitle: `${formatDateDDMMYYYY(range.from)} → ${formatDateDDMMYYYY(range.to)} • Asia/Karachi`,
      bodyHtml: buildHourlyPdf(matrix, metric, formatCurrency),
      brand,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Metric</span>
        <div className="flex items-center rounded-md bg-muted p-1">
          <Button
            type="button"
            size="sm"
            variant={metric === 'net' ? 'default' : 'ghost'}
            className="h-7 px-3 text-xs"
            onClick={() => setMetric('net')}
          >
            Net sales
          </Button>
          <Button
            type="button"
            size="sm"
            variant={metric === 'orders' ? 'default' : 'ghost'}
            className="h-7 px-3 text-xs"
            onClick={() => setMetric('orders')}
          >
            Orders
          </Button>
        </div>
      </div>
      <ReportsExportSlot>
        <ExportButton
          report="hourly"
          reportLabel="Hourly sales"
          fromISO={range.fromISO}
          toISO={range.toISO}
          onPrintPdf={handlePrintPdf}
        />
      </ReportsExportSlot>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Day-of-week × hour heatmap</CardTitle>
          {peak && (
            <Badge variant="outline" className="text-xs">
              Peak: {DOW_LABELS[peak.dow]} {String(peak.hour).padStart(2, '0')}:00 •{' '}
              {formatMetricValue(metric === 'net' ? peak.net : peak.orders)}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {hourlyQuery.isLoading ? (
            <Skeleton className="w-full h-[260px]" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-[10px]">
                <thead>
                  <tr>
                    <th className="w-10"></th>
                    {HOUR_LABELS.map((h) => (
                      <th key={h} className="font-normal text-muted-foreground">
                        {String(h).padStart(2, '0')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, dow) => (
                    <tr key={dow}>
                      <th className="text-right pr-2 font-medium text-muted-foreground">
                        {DOW_LABELS[dow]}
                      </th>
                      {row.map((cell) => {
                        const value = metric === 'net' ? cell.net : cell.orders
                        return (
                          <td
                            key={`${dow}-${cell.hour}`}
                            title={`${DOW_LABELS[dow]} ${String(cell.hour).padStart(2, '0')}:00 — ${formatMetricValue(value)} (${cell.orders} order${cell.orders === 1 ? '' : 's'})`}
                            className={cn('h-7 rounded-sm transition-colors', heatColor(value, max))}
                          />
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-3">
            Each cell aggregates {metric === 'net' ? 'net sales' : 'order counts'} across the
            selected date range. Hours with zero activity are blank — that's your "dead" hours.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hourly trend</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px]">
          {hourlyQuery.isLoading ? (
            <Skeleton className="w-full h-full" />
          ) : series.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No sales in this range
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.18)" vertical={false} />
                <XAxis
                  dataKey="hour_start_label"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis fontSize={10} tickLine={false} axisLine={false} width={50} />
                <ReTooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [formatMetricValue(v), metric === 'net' ? 'Net sales' : 'Orders']}
                />
                <Line
                  type="monotone"
                  dataKey={metric}
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function heatColor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return 'bg-muted/30'
  const intensity = value / max
  // 5-stop ramp inspired by green→amber→red weather heatmaps but using
  // brand-friendly sky-blue → indigo → fuchsia for "more activity".
  if (intensity < 0.2) return 'bg-sky-200/70 dark:bg-sky-900/40'
  if (intensity < 0.4) return 'bg-sky-400/80 dark:bg-sky-700/60'
  if (intensity < 0.6) return 'bg-indigo-500/85 dark:bg-indigo-600/70'
  if (intensity < 0.8) return 'bg-violet-600/90 dark:bg-violet-500/80'
  return 'bg-fuchsia-600 dark:bg-fuchsia-500'
}

function buildHourlyPdf(
  matrix: HourlyHeatmapCell[][],
  metric: Metric,
  formatCurrency: (n: number) => string,
): string {
  const headerCells = ['', ...HOUR_LABELS.map((h) => String(h).padStart(2, '0'))]
    .map((h) => `<th class="num">${escapeHtml(h)}</th>`)
    .join('')
  const rows = matrix
    .map((row, dow) => {
      const cells = row
        .map((c) => {
          const v = metric === 'net' ? c.net : c.orders
          return `<td class="num">${v > 0 ? escapeHtml(metric === 'net' ? formatCurrency(v) : String(v)) : ''}</td>`
        })
        .join('')
      return `<tr><th>${DOW_LABELS[dow]}</th>${cells}</tr>`
    })
    .join('')
  return `
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `
}
