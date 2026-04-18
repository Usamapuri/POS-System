import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { CurrentDayStatus, PnLReport, ExpenseSummary } from '@/types'
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle2,
  Lock,
  Banknote,
  CreditCard,
  Wallet,
} from 'lucide-react'
import { getCategoryBadge } from './expense-constants'
import { formatDateDDMMYYYY } from '@/lib/utils'
import { useExpenseCategoryDefs } from './use-expense-category-defs'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
} from 'recharts'

type Props = {
  dayStatus?: CurrentDayStatus
  /** P&L for an explicit range (e.g. month-to-date); revenue uses completed order dates on server */
  overviewPnL?: PnLReport
  overviewRangeLabel: string
  /** GET /admin/expenses/summary for the same MTD window */
  mtdExpenseSummary?: ExpenseSummary
  /** Daily P&L rows for a 7-day window (net sparkline) */
  weekPnL?: PnLReport
  weekRangeLabel: string
}

function shortDayLabel(iso: string) {
  return formatDateDDMMYYYY(iso)
}

export function ExpenseOverviewTab({
  dayStatus,
  overviewPnL,
  overviewRangeLabel,
  mtdExpenseSummary,
  weekPnL,
  weekRangeLabel,
}: Props) {
  const { formatCurrency } = useCurrency()
  const { data: defs = [] } = useExpenseCategoryDefs()
  const todaySales = dayStatus?.total_sales ?? 0
  const todayExpenses = dayStatus?.total_expenses ?? 0
  const todayProfit = dayStatus?.net_profit ?? 0
  const mtdProfit = overviewPnL?.summary?.net_profit ?? 0

  const payCash = dayStatus?.cash_sales ?? 0
  const payCard = dayStatus?.card_sales ?? 0
  const payDigital = dayStatus?.digital_sales ?? 0
  const paySum = payCash + payCard + payDigital

  const netSeries =
    weekPnL?.rows?.map(r => ({
      day: shortDayLabel(r.period),
      net: r.net_profit,
    })) ?? []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Today&apos;s revenue</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(todaySales)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Completed orders (sales date)</p>
              </div>
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <ArrowUpCircle className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Today&apos;s expenses</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(todayExpenses)}</p>
              </div>
              <div className="rounded-xl bg-destructive/10 p-3">
                <ArrowDownCircle className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Today&apos;s profit</p>
                <p className={`text-2xl font-bold ${todayProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  {formatCurrency(todayProfit)}
                </p>
              </div>
              <div className={`rounded-xl p-3 ${todayProfit >= 0 ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
                {todayProfit >= 0 ? (
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-destructive" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Period net (P&amp;L)</p>
                <p className={`text-2xl font-bold ${mtdProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  {formatCurrency(mtdProfit)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{overviewRangeLabel}</p>
              </div>
              <div className="rounded-xl bg-violet-500/10 p-3">
                <BarChart3 className="h-6 w-6 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {netSeries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily net profit</CardTitle>
            <p className="text-xs text-muted-foreground">{weekRangeLabel}</p>
          </CardHeader>
          <CardContent className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={netSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={64} tickFormatter={v => formatCurrency(Number(v))} />
                <ReTooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="net" name="Net" stroke="#8b5cf6" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Today&apos;s sales by payment method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Cash', value: payCash, icon: <Banknote className="h-4 w-4 text-emerald-600" />, wrap: 'bg-emerald-500/10' },
              { label: 'Card', value: payCard, icon: <CreditCard className="h-4 w-4 text-blue-600" />, wrap: 'bg-blue-500/10' },
              { label: 'Digital wallet', value: payDigital, icon: <Wallet className="h-4 w-4 text-violet-600" />, wrap: 'bg-violet-500/10' },
            ].map(m => (
              <div key={m.label} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded-md p-2 ${m.wrap}`}>{m.icon}</div>
                  <span className="text-sm font-medium">{m.label}</span>
                </div>
                <span className="font-semibold tabular-nums">{formatCurrency(m.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-sm font-medium text-muted-foreground">Total ({dayStatus?.total_orders ?? 0} orders)</span>
              <span className="font-bold tabular-nums">{formatCurrency(todaySales)}</span>
            </div>
            {Math.abs(paySum - todaySales) > 0.02 && (
              <p className="text-xs text-muted-foreground">
                Order totals and payment splits can differ when orders use multiple tenders or partial payments. Order
                total is the source for revenue; payments show cash discipline.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Today&apos;s expense breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dayStatus?.expense_categories && dayStatus.expense_categories.length > 0 ? (
              <>
                {dayStatus.expense_categories.map(ec => {
                  const badge = getCategoryBadge(ec.category, defs)
                  return (
                    <div key={ec.category} className="flex items-center justify-between rounded-lg bg-muted/50 p-2">
                      <Badge className={badge.color}>{badge.label}</Badge>
                      <span className="font-semibold tabular-nums">{formatCurrency(ec.total)}</span>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-sm font-medium text-muted-foreground">Total expenses</span>
                  <span className="font-bold text-destructive tabular-nums">{formatCurrency(todayExpenses)}</span>
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No expenses recorded today</p>
            )}
          </CardContent>
        </Card>
      </div>

      {mtdExpenseSummary && mtdExpenseSummary.categories && mtdExpenseSummary.categories.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Month-to-date expenses (ledger)</CardTitle>
            <p className="text-xs text-muted-foreground">
              From <span className="font-mono text-foreground/80">{mtdExpenseSummary.from}</span> to{' '}
              <span className="font-mono text-foreground/80">{mtdExpenseSummary.to}</span> · same window as period net
              above
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {mtdExpenseSummary.categories.map(row => {
              const badge = getCategoryBadge(row.category, defs)
              return (
                <div key={row.category} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={badge.color}>{badge.label}</Badge>
                    <span className="text-xs text-muted-foreground">{row.count} entries</span>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(row.total)}</span>
                </div>
              )
            })}
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-sm font-medium text-muted-foreground">Grand total</span>
              <span className="font-bold text-destructive tabular-nums">
                {formatCurrency(mtdExpenseSummary.grand_total)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {dayStatus && (
        <Card>
          <CardContent className="flex items-center gap-2 p-5">
            {dayStatus.is_closed ? (
              <>
                <Lock className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">Today has been closed</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  Day is open — use Daily Closing when you are ready to reconcile cash.
                </span>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
