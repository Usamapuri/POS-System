import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  Banknote,
  CreditCard,
  Globe,
  Receipt,
  ShoppingBag,
  Tags,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import apiClient from '@/api/client'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { UseReportRange } from '@/hooks/useReportRange'
import type { OverviewReport, DailySalesRow } from '@/types'
import { MetricTile } from './MetricTile'
import { ExportButton } from './ExportButton'
import { openPrintableReport, escapeHtml } from '@/lib/printReport'
import { formatDateDDMMYYYY } from '@/lib/utils'

const TENDER_COLORS: Record<string, string> = {
  cash: '#22c55e',
  card: '#3b82f6',
  online: '#a855f7',
  other: '#9ca3af',
}

function tenderColor(method: string): string {
  return TENDER_COLORS[method] ?? TENDER_COLORS.other
}

function tenderIcon(method: string) {
  switch (method) {
    case 'cash':
      return <Banknote className="w-3.5 h-3.5" />
    case 'card':
      return <CreditCard className="w-3.5 h-3.5" />
    case 'online':
      return <Globe className="w-3.5 h-3.5" />
    default:
      return <Receipt className="w-3.5 h-3.5" />
  }
}

function tenderLabel(method: string): string {
  switch (method) {
    case 'cash':
      return 'Cash'
    case 'card':
      return 'Card'
    case 'online':
      return 'Online'
    default:
      return method.charAt(0).toUpperCase() + method.slice(1)
  }
}

interface Props {
  range: UseReportRange
}

export function OverviewTab({ range }: Props) {
  const { formatCurrency } = useCurrency()

  const overviewQuery = useQuery({
    queryKey: ['reports-v2', 'overview', range.fromISO, range.toISO],
    queryFn: () => apiClient.getReportsOverview(range.fromISO, range.toISO),
    staleTime: 30_000,
  })

  const dailyQuery = useQuery({
    queryKey: ['reports-v2', 'daily', range.fromISO, range.toISO],
    queryFn: () => apiClient.getDailySalesReport(range.fromISO, range.toISO),
    staleTime: 30_000,
  })

  const overview = overviewQuery.data?.data
  const daily = dailyQuery.data?.data ?? []

  const comparisonLabel = useMemo(() => {
    if (!overview) return 'vs. previous period'
    return `vs. ${formatDateDDMMYYYY(overview.previous_from)} → ${formatDateDDMMYYYY(overview.previous_to)}`
  }, [overview])

  const tenderTotal = (overview?.tender_mix ?? []).reduce((s, r) => s + r.amount, 0)
  const formatNumber = (n: number) => n.toLocaleString('en-US')

  const handlePrintPdf = () => {
    if (!overview) return
    openPrintableReport({
      title: 'Sales Overview',
      subtitle: `${formatDateDDMMYYYY(range.from)} → ${formatDateDDMMYYYY(range.to)} • ${overview.timezone}`,
      bodyHtml: buildOverviewPdf(overview, daily, formatCurrency),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <ExportButton
          report="overview"
          reportLabel="Overview"
          fromISO={range.fromISO}
          toISO={range.toISO}
          onPrintPdf={handlePrintPdf}
        />
      </div>

      {overviewQuery.isError && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">
            Failed to load overview: {String((overviewQuery.error as Error)?.message ?? 'unknown')}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {overviewQuery.isLoading || !overview ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-4 w-40" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <MetricTile
              label="Net Sales"
              metric={overview.net_sales}
              formatValue={formatCurrency}
              comparisonLabel={comparisonLabel}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <MetricTile
              label="Orders"
              metric={overview.orders}
              formatValue={formatNumber}
              comparisonLabel={comparisonLabel}
              icon={<ShoppingBag className="w-4 h-4" />}
            />
            <MetricTile
              label="Covers"
              metric={overview.covers}
              formatValue={formatNumber}
              comparisonLabel={comparisonLabel}
              icon={<Users className="w-4 h-4" />}
            />
            <MetricTile
              label="Average Check"
              metric={overview.average_check}
              formatValue={formatCurrency}
              comparisonLabel={comparisonLabel}
              icon={<Receipt className="w-4 h-4" />}
            />
            <MetricTile
              label="Gross Sales"
              metric={overview.gross_sales}
              formatValue={formatCurrency}
              comparisonLabel={comparisonLabel}
            />
            <MetricTile
              label="Discounts"
              metric={overview.discounts}
              formatValue={formatCurrency}
              comparisonLabel={comparisonLabel}
              invertColors
              icon={<Tags className="w-4 h-4" />}
            />
            <MetricTile
              label="Tax Collected"
              metric={overview.tax}
              formatValue={formatCurrency}
              comparisonLabel={comparisonLabel}
            />
            <MetricTile
              label="Service Charge"
              metric={overview.service_charge}
              formatValue={formatCurrency}
              comparisonLabel={comparisonLabel}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Net sales trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {dailyQuery.isLoading ? (
              <Skeleton className="w-full h-full" />
            ) : daily.length === 0 ? (
              <EmptyState message="No sales in the selected range" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.18)" vertical={false} />
                  <XAxis
                    dataKey="date_label"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCompact(v)}
                    width={60}
                  />
                  <ReTooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [formatCurrency(v), 'Net sales']}
                  />
                  <Line type="monotone" dataKey="net" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tender mix</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {overviewQuery.isLoading ? (
              <Skeleton className="w-full h-full" />
            ) : !overview || overview.tender_mix.length === 0 || tenderTotal === 0 ? (
              <EmptyState message="No payments yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overview.tender_mix}
                    dataKey="amount"
                    nameKey="method"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {overview.tender_mix.map((entry) => (
                      <Cell key={entry.method} fill={tenderColor(entry.method)} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [formatCurrency(v), tenderLabel(String(name))]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconSize={8}
                    formatter={(value) => (
                      <span className="text-xs">{tenderLabel(String(value))}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {overview && overview.tender_mix.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tender mix breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.tender_mix.map((row) => (
              <div
                key={row.method}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 p-3"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span style={{ color: tenderColor(row.method) }}>{tenderIcon(row.method)}</span>
                  <span className="font-medium">{tenderLabel(row.method)}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {row.count} order{row.count === 1 ? '' : 's'}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm tabular-nums">
                  <span className="text-muted-foreground">{row.pct.toFixed(1)}%</span>
                  <span className="font-semibold">{formatCurrency(row.amount)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function buildOverviewPdf(
  overview: OverviewReport,
  daily: DailySalesRow[],
  formatCurrency: (n: number) => string,
): string {
  const kpis = [
    ['Net Sales', formatCurrency(overview.net_sales.current)],
    ['Gross Sales', formatCurrency(overview.gross_sales.current)],
    ['Discounts', formatCurrency(overview.discounts.current)],
    ['Tax', formatCurrency(overview.tax.current)],
    ['Service Charge', formatCurrency(overview.service_charge.current)],
    ['Orders', overview.orders.current.toLocaleString('en-US')],
    ['Covers', overview.covers.current.toLocaleString('en-US')],
    ['Average Check', formatCurrency(overview.average_check.current)],
  ]
  const kvHtml = kpis
    .map(
      ([label, value]) =>
        `<div><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`,
    )
    .join('')
  const tenderRows = overview.tender_mix
    .map(
      (t) =>
        `<tr><td>${escapeHtml(tenderLabel(t.method))}</td><td class="num">${t.count}</td><td class="num">${escapeHtml(formatCurrency(t.amount))}</td><td class="num">${t.pct.toFixed(1)}%</td></tr>`,
    )
    .join('')
  const dailyRows = daily
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.date_label)}</td><td class="num">${d.orders}</td><td class="num">${d.covers}</td><td class="num">${escapeHtml(formatCurrency(d.net))}</td></tr>`,
    )
    .join('')

  return `
    <section><div class="kv">${kvHtml}</div></section>
    <section><div class="section-title">Tender mix</div>
      <table><thead><tr><th>Method</th><th class="num">Orders</th><th class="num">Amount</th><th class="num">% of total</th></tr></thead>
        <tbody>${tenderRows || `<tr><td colspan="4" class="muted">No payments</td></tr>`}</tbody></table>
    </section>
    <section><div class="section-title">Daily sales</div>
      <table><thead><tr><th>Date</th><th class="num">Orders</th><th class="num">Covers</th><th class="num">Net</th></tr></thead>
        <tbody>${dailyRows || `<tr><td colspan="4" class="muted">No sales</td></tr>`}</tbody></table>
    </section>
  `
}
