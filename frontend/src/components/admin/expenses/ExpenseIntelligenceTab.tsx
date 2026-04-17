import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { ExpenseIntelligenceReport } from '@/types'
import { getCategoryBadge } from './expense-constants'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Package,
  Wallet,
  PieChart as PieChartIcon,
  RefreshCw,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

const MIX_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

type Props = {
  report: ExpenseIntelligenceReport | undefined
  loading: boolean
  periodDays: string
  setPeriodDays: (p: string) => void
}

export function ExpenseIntelligenceTab({ report, loading, periodDays, setPeriodDays }: Props) {
  const { formatCurrency } = useCurrency()

  if (loading || !report) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    )
  }

  const { kpis, daily_trend, category_mix, cash_closing_stats } = report
  const pieData = category_mix.map(c => ({
    name: getCategoryBadge(c.category).label,
    value: c.total,
    pct: c.pct,
  }))

  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Expense intelligence</h3>
          <p className="text-sm text-muted-foreground">
            {report.from} → {report.to} · completed sales vs recorded expenses
          </p>
        </div>
        <select
          value={periodDays}
          onChange={e => setPeriodDays(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="60">Last 60 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="rounded-xl bg-emerald-500/10 p-2.5">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(kpis.total_sales)}</p>
              <p className="text-xs text-muted-foreground">Sales (completed)</p>
              <p className="mt-1 flex items-center gap-1 text-xs">
                {kpis.sales_change_pct >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className={kpis.sales_change_pct >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                  {fmtPct(kpis.sales_change_pct)} vs prior window
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="rounded-xl bg-destructive/10 p-2.5">
              <Wallet className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(kpis.total_expenses)}</p>
              <p className="text-xs text-muted-foreground">Total expenses</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fmtPct(kpis.expenses_change_pct)} vs prior window
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="rounded-xl bg-violet-500/10 p-2.5">
              <PieChartIcon className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {(kpis.expense_ratio * 100).toFixed(1)}
                <span className="text-base font-medium text-muted-foreground">%</span>
              </p>
              <p className="text-xs text-muted-foreground">Expense ratio (expenses ÷ sales)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="rounded-xl bg-blue-500/10 p-2.5">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {(kpis.inventory_to_sales_ratio * 100).toFixed(1)}
                <span className="text-base font-medium text-muted-foreground">%</span>
              </p>
              <p className="text-xs text-muted-foreground">Inventory spend ÷ sales</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(kpis.inventory_spend)} purchases</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {daily_trend.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <RefreshCw className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">No trend data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily_trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatCurrency(Number(v))} width={68} />
                  <ReTooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="sales" name="Sales" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="net" name="Net" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Category mix</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {pieData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No expenses in range</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    label={({ percent }) => `${((percent as number) * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={MIX_COLORS[i % MIX_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend layout="horizontal" verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expense entry mix</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            <Badge variant="secondary">Manual: {kpis.manual_expense_count}</Badge>
            <Badge variant="outline">Auto-linked: {kpis.auto_linked_expense_count}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cash closing (in range)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Days closed</span>
              <span className="font-medium">{cash_closing_stats.days_with_closing}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg cash difference</span>
              <span className="font-medium tabular-nums">{formatCurrency(cash_closing_stats.avg_cash_difference)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total abs variance</span>
              <span className="font-medium tabular-nums">{formatCurrency(cash_closing_stats.total_abs_cash_variance)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
