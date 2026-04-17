import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { CurrentDayStatus, DailyClosing, MetaData } from '@/types'
import { Lock, ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  dayStatus?: CurrentDayStatus
  closings?: DailyClosing[]
  meta?: MetaData
  page: number
  setPage: (p: number) => void
  onClose: () => void
}

export function ExpenseClosingTab({ dayStatus, closings, meta, page, setPage, onClose }: Props) {
  const { formatCurrency } = useCurrency()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">Today&apos;s running totals</CardTitle>
          {dayStatus && !dayStatus.is_closed && (
            <Button onClick={onClose} className="bg-orange-600 hover:bg-orange-700">
              <Lock className="mr-1 h-4 w-4" />
              Close day
            </Button>
          )}
          {dayStatus?.is_closed && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" />
              Day closed
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {dayStatus ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: 'Total sales', value: dayStatus.total_sales, color: 'text-emerald-600', currency: true },
                { label: 'Total orders', value: dayStatus.total_orders, color: 'text-blue-600', currency: false },
                { label: 'Cash sales', value: dayStatus.cash_sales, color: 'text-emerald-700', currency: true },
                { label: 'Total expenses', value: dayStatus.total_expenses, color: 'text-destructive', currency: true },
                {
                  label: 'Net profit',
                  value: dayStatus.net_profit,
                  color: dayStatus.net_profit >= 0 ? 'text-emerald-600' : 'text-destructive',
                  currency: true,
                },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-lg font-bold tabular-nums ${s.color}`}>
                    {s.currency ? formatCurrency(Number(s.value)) : s.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past closings</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto px-6 pb-6">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="p-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="p-3 text-right font-medium text-muted-foreground">Sales</th>
                <th className="p-3 text-right font-medium text-muted-foreground">Orders</th>
                <th className="p-3 text-right font-medium text-muted-foreground">Expenses</th>
                <th className="p-3 text-right font-medium text-muted-foreground">Net profit</th>
                <th className="p-3 text-right font-medium text-muted-foreground">Cash diff</th>
                <th className="p-3 text-left font-medium text-muted-foreground">Closed by</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {closings && closings.length > 0 ? (
                closings.map(dc => (
                  <tr key={dc.id} className="hover:bg-muted/40">
                    <td className="p-3 font-medium">{dc.closing_date}</td>
                    <td className="p-3 text-right font-medium text-emerald-600 tabular-nums">
                      {formatCurrency(dc.total_sales)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{dc.total_orders}</td>
                    <td className="p-3 text-right font-medium text-destructive tabular-nums">
                      {formatCurrency(dc.total_expenses)}
                    </td>
                    <td
                      className={`p-3 text-right font-bold tabular-nums ${
                        dc.net_profit >= 0 ? 'text-emerald-600' : 'text-destructive'
                      }`}
                    >
                      {formatCurrency(dc.net_profit)}
                    </td>
                    <td
                      className={`p-3 text-right tabular-nums ${
                        (dc.cash_difference ?? 0) >= 0 ? 'text-emerald-600' : 'text-destructive'
                      }`}
                    >
                      {dc.cash_difference != null ? formatCurrency(dc.cash_difference) : '—'}
                    </td>
                    <td className="p-3 text-muted-foreground">{dc.closed_by_name || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    No closings yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {meta.current_page} of {meta.total_pages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.total_pages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
