import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { PnLReport } from '@/types'
import { getCategoryBadge } from './expense-constants'
import {
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  Receipt,
  FileText,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

function formatPeriod(dateStr: string, period: string): string {
  try {
    const d = new Date(dateStr)
    if (period === 'hourly')
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    if (period === 'weekly') return `Week of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    if (period === 'monthly') return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

type Props = {
  pnl?: PnLReport
  period: string
  setPeriod: (p: string) => void
  from: string
  setFrom: (f: string) => void
  to: string
  setTo: (t: string) => void
}

export function ExpensePnLTab({ pnl, period, setPeriod, from, setFrom, to, setTo }: Props) {
  const { formatCurrency } = useCurrency()

  const chartData =
    pnl?.rows?.map(r => ({
      label: formatPeriod(r.period, period),
      revenue: r.revenue,
      expenses: r.expenses,
      net: r.net_profit,
    })) ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Granularity</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" className="w-[160px]" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" className="w-[160px]" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          Revenue uses <strong>completed order</strong> dates (aligned with daily closing). Expenses use expense date.
        </p>
      </div>

      {pnl?.summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            {
              label: 'Total revenue',
              value: pnl.summary.total_revenue,
              color: 'text-emerald-600',
              icon: <ArrowUpCircle className="h-5 w-5 text-emerald-500" />,
              cur: true,
            },
            {
              label: 'Total tax',
              value: pnl.summary.total_tax,
              color: 'text-muted-foreground',
              icon: <FileText className="h-5 w-5" />,
              cur: true,
            },
            {
              label: 'Total orders',
              value: pnl.summary.total_orders,
              color: 'text-blue-600',
              icon: <Receipt className="h-5 w-5 text-blue-500" />,
              cur: false,
            },
            {
              label: 'Total expenses',
              value: pnl.summary.total_expenses,
              color: 'text-destructive',
              icon: <ArrowDownCircle className="h-5 w-5 text-destructive" />,
              cur: true,
            },
            {
              label: 'Net profit',
              value: pnl.summary.net_profit,
              color: pnl.summary.net_profit >= 0 ? 'text-emerald-600' : 'text-destructive',
              icon: <DollarSign className="h-5 w-5 text-violet-500" />,
              cur: true,
            },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="mb-1 flex items-center gap-2">
                  {s.icon}
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <p className={`text-xl font-bold tabular-nums ${s.color}`}>
                  {s.cur ? formatCurrency(Number(s.value)) : s.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue, expenses &amp; net</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatCurrency(Number(v))} width={72} />
                <ReTooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" name="Net" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Period breakdown</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto px-6 pb-6">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="p-3 text-left font-medium text-muted-foreground">Period</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">Revenue</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">Orders</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">Expenses</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">Net profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pnl?.rows && pnl.rows.length > 0 ? (
                    pnl.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-muted/40">
                        <td className="p-3 text-muted-foreground">{formatPeriod(r.period, period)}</td>
                        <td className="p-3 text-right font-medium text-emerald-600 tabular-nums">
                          {formatCurrency(r.revenue)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{r.orders}</td>
                        <td className="p-3 text-right font-medium text-destructive tabular-nums">
                          {formatCurrency(r.expenses)}
                        </td>
                        <td
                          className={`p-3 text-right font-bold tabular-nums ${
                            r.net_profit >= 0 ? 'text-emerald-600' : 'text-destructive'
                          }`}
                        >
                          {formatCurrency(r.net_profit)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-muted-foreground">
                        No data for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expense by category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pnl?.expense_breakdown && pnl.expense_breakdown.length > 0 ? (
              pnl.expense_breakdown.map(eb => {
                const badge = getCategoryBadge(eb.category)
                return (
                  <div key={eb.category} className="flex items-center justify-between rounded-lg bg-muted/50 p-2">
                    <Badge className={badge.color}>{badge.label}</Badge>
                    <span className="font-semibold tabular-nums">{formatCurrency(eb.total)}</span>
                  </div>
                )
              })
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No expenses in this period</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
