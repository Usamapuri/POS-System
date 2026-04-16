import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { Expense, DailyClosing, PnLReport, CurrentDayStatus, ExpenseCategory } from '@/types'
import { useCurrency } from '@/contexts/CurrencyContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign, TrendingUp, TrendingDown, Receipt, Calendar, Plus, Search, X,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, Lock, BarChart3,
  ArrowUpCircle, ArrowDownCircle, CreditCard, Wallet, Banknote, FileText
} from 'lucide-react'

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; color: string }[] = [
  { value: 'inventory_purchase', label: 'Inventory Purchase', color: 'bg-blue-100 text-blue-800' },
  { value: 'utilities', label: 'Utilities', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'rent', label: 'Rent', color: 'bg-purple-100 text-purple-800' },
  { value: 'salaries', label: 'Salaries', color: 'bg-green-100 text-green-800' },
  { value: 'maintenance', label: 'Maintenance', color: 'bg-orange-100 text-orange-800' },
  { value: 'marketing', label: 'Marketing', color: 'bg-pink-100 text-pink-800' },
  { value: 'supplies', label: 'Supplies', color: 'bg-cyan-100 text-cyan-800' },
  { value: 'other', label: 'Other', color: 'bg-gray-100 text-gray-800' },
]

function getCategoryBadge(cat: string) {
  const found = EXPENSE_CATEGORIES.find(c => c.value === cat)
  return found || { label: cat, color: 'bg-gray-100 text-gray-800' }
}

type Toast = { id: number; type: 'success' | 'error'; message: string }
let toastIdCounter = 0

type Tab = 'overview' | 'expenses' | 'closing' | 'pnl'
type ModalState =
  | { kind: 'none' }
  | { kind: 'addExpense' }
  | { kind: 'editExpense'; expense: Expense }
  | { kind: 'closeDay' }

function OverviewTab({ dayStatus, pnl }: { dayStatus?: CurrentDayStatus; pnl?: PnLReport }) {
  const { formatCurrency } = useCurrency()
  const todaySales = dayStatus?.total_sales ?? 0
  const todayExpenses = dayStatus?.total_expenses ?? 0
  const todayProfit = dayStatus?.net_profit ?? 0
  const mtdProfit = pnl?.summary?.net_profit ?? 0

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Today's Revenue</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(todaySales)}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg"><ArrowUpCircle className="w-6 h-6 text-green-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Today's Expenses</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(todayExpenses)}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg"><ArrowDownCircle className="w-6 h-6 text-red-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Today's Profit</p>
                <p className={`text-2xl font-bold ${todayProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(todayProfit)}</p>
              </div>
              <div className={`p-3 rounded-lg ${todayProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                {todayProfit >= 0 ? <TrendingUp className="w-6 h-6 text-green-600" /> : <TrendingDown className="w-6 h-6 text-red-600" />}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Period P&L</p>
                <p className={`text-2xl font-bold ${mtdProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(mtdProfit)}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg"><BarChart3 className="w-6 h-6 text-purple-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Method Breakdown + Expense Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Today's Sales by Payment Method</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Cash', value: dayStatus?.cash_sales ?? 0, icon: <Banknote className="w-4 h-4 text-green-600" />, color: 'bg-green-100' },
              { label: 'Card', value: dayStatus?.card_sales ?? 0, icon: <CreditCard className="w-4 h-4 text-blue-600" />, color: 'bg-blue-100' },
              { label: 'Digital Wallet', value: dayStatus?.digital_sales ?? 0, icon: <Wallet className="w-4 h-4 text-purple-600" />, color: 'bg-purple-100' },
            ].map(m => (
              <div key={m.label} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${m.color}`}>{m.icon}</div>
                  <span className="text-sm font-medium text-gray-700">{m.label}</span>
                </div>
                <span className="font-semibold text-gray-900">{formatCurrency(m.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-medium text-gray-500">Total ({dayStatus?.total_orders ?? 0} orders)</span>
              <span className="font-bold text-gray-900">{formatCurrency(todaySales)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Today's Expense Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dayStatus?.expense_categories && dayStatus.expense_categories.length > 0 ? (
              <>
                {dayStatus.expense_categories.map(ec => {
                  const badge = getCategoryBadge(ec.category)
                  return (
                    <div key={ec.category} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                      <Badge className={badge.color}>{badge.label}</Badge>
                      <span className="font-semibold text-gray-900">{formatCurrency(ec.total)}</span>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium text-gray-500">Total Expenses</span>
                  <span className="font-bold text-red-600">{formatCurrency(todayExpenses)}</span>
                </div>
              </>
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">No expenses recorded today</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Day Status */}
      {dayStatus && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              {dayStatus.is_closed ? (
                <><Lock className="w-5 h-5 text-gray-500" /><span className="font-medium text-gray-500">Today has been closed</span></>
              ) : (
                <><CheckCircle2 className="w-5 h-5 text-green-500" /><span className="font-medium text-green-700">Day is open — go to Daily Closing tab to close</span></>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ExpensesTab({
  expenses, meta, page, setPage, category, setCategory, from, setFrom, to, setTo,
  search, setSearch, onAdd, onEdit, onDelete,
}: {
  expenses?: Expense[]; meta?: any; page: number; setPage: (p: number) => void
  category: string; setCategory: (c: string) => void; from: string; setFrom: (f: string) => void
  to: string; setTo: (t: string) => void; search: string; setSearch: (s: string) => void
  onAdd: () => void; onEdit: (e: Expense) => void; onDelete: (id: string) => void
}) {
  const { formatCurrency } = useCurrency()
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm" placeholder="Search description..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="border rounded-lg px-3 py-2 text-sm" value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}>
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} />
        <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} />
        {(category || from || to || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setCategory(''); setFrom(''); setTo(''); setSearch(''); setPage(1) }}>
            <X className="w-4 h-4 mr-1" />Clear
          </Button>
        )}
        <Button onClick={onAdd} className="ml-auto"><Plus className="w-4 h-4 mr-1" />Add Expense</Button>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">Date</th>
                <th className="text-left p-3 font-medium text-gray-600">Category</th>
                <th className="text-left p-3 font-medium text-gray-600">Description</th>
                <th className="text-right p-3 font-medium text-gray-600">Amount</th>
                <th className="text-left p-3 font-medium text-gray-600">Created By</th>
                <th className="text-left p-3 font-medium text-gray-600">Type</th>
                <th className="text-right p-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {expenses && expenses.length > 0 ? expenses.map(e => {
                const badge = getCategoryBadge(e.category)
                const isAutoLinked = !!e.reference_type
                return (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="p-3 text-gray-700">{e.expense_date}</td>
                    <td className="p-3"><Badge className={badge.color}>{badge.label}</Badge></td>
                    <td className="p-3 text-gray-700 max-w-xs truncate">{e.description || '—'}</td>
                    <td className="p-3 text-right font-semibold text-red-600">{formatCurrency(e.amount)}</td>
                    <td className="p-3 text-gray-600">{e.created_by_name || '—'}</td>
                    <td className="p-3">
                      {isAutoLinked ? (
                        <Badge className="bg-blue-50 text-blue-700"><Lock className="w-3 h-3 mr-1" />Auto</Badge>
                      ) : (
                        <Badge className="bg-gray-50 text-gray-700">Manual</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {!isAutoLinked ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => onEdit(e)}>Edit</Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onDelete(e.id)}>Delete</Button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Read-only</span>
                      )}
                    </td>
                  </tr>
                )
              }) : (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">No expenses found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Page {meta.current_page} of {meta.total_pages} ({meta.total} total)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.total_pages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ClosingTab({
  dayStatus, closings, meta, page, setPage, onClose,
}: {
  dayStatus?: CurrentDayStatus; closings?: DailyClosing[]; meta?: any
  page: number; setPage: (p: number) => void; onClose: () => void
}) {
  const { formatCurrency } = useCurrency()
  return (
    <div className="space-y-6">
      {/* Current Day Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Today's Running Totals</CardTitle>
            {dayStatus && !dayStatus.is_closed && (
              <Button onClick={onClose} className="bg-orange-600 hover:bg-orange-700"><Lock className="w-4 h-4 mr-1" />Close Day</Button>
            )}
            {dayStatus?.is_closed && (
              <Badge className="bg-gray-200 text-gray-600"><Lock className="w-3 h-3 mr-1" />Day Closed</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {dayStatus ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: 'Total Sales', value: dayStatus.total_sales, color: 'text-green-600' },
                { label: 'Total Orders', value: dayStatus.total_orders, color: 'text-blue-600', isCurrency: false },
                { label: 'Cash Sales', value: dayStatus.cash_sales, color: 'text-green-700' },
                { label: 'Total Expenses', value: dayStatus.total_expenses, color: 'text-red-600' },
                { label: 'Net Profit', value: dayStatus.net_profit, color: dayStatus.net_profit >= 0 ? 'text-green-600' : 'text-red-600' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-lg font-bold ${s.color}`}>
                    {(s as any).isCurrency === false ? s.value : formatCurrency(Number(s.value))}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Loading...</p>
          )}
        </CardContent>
      </Card>

      {/* Past Closings */}
      <Card>
        <CardHeader><CardTitle className="text-base">Past Closings</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">Date</th>
                <th className="text-right p-3 font-medium text-gray-600">Sales</th>
                <th className="text-right p-3 font-medium text-gray-600">Orders</th>
                <th className="text-right p-3 font-medium text-gray-600">Expenses</th>
                <th className="text-right p-3 font-medium text-gray-600">Net Profit</th>
                <th className="text-right p-3 font-medium text-gray-600">Cash Diff</th>
                <th className="text-left p-3 font-medium text-gray-600">Closed By</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {closings && closings.length > 0 ? closings.map(dc => (
                <tr key={dc.id} className="hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-900">{dc.closing_date}</td>
                  <td className="p-3 text-right text-green-600 font-medium">{formatCurrency(dc.total_sales)}</td>
                  <td className="p-3 text-right text-gray-700">{dc.total_orders}</td>
                  <td className="p-3 text-right text-red-600 font-medium">{formatCurrency(dc.total_expenses)}</td>
                  <td className={`p-3 text-right font-bold ${dc.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(dc.net_profit)}</td>
                  <td className={`p-3 text-right ${(dc.cash_difference ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {dc.cash_difference != null ? formatCurrency(dc.cash_difference) : '—'}
                  </td>
                  <td className="p-3 text-gray-600">{dc.closed_by_name || '—'}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">No closings yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Page {meta.current_page} of {meta.total_pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= meta.total_pages} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
    </div>
  )
}

function PnLTab({
  pnl, period, setPeriod, from, setFrom, to, setTo,
}: {
  pnl?: PnLReport; period: string; setPeriod: (p: string) => void
  from: string; setFrom: (f: string) => void; to: string; setTo: (t: string) => void
}) {
  const { formatCurrency } = useCurrency()
  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Period</label>
          <select className="border rounded-lg px-3 py-2 text-sm" value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      {/* Summary Cards */}
      {pnl?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: 'Total Revenue', value: pnl.summary.total_revenue, color: 'text-green-600', icon: <ArrowUpCircle className="w-5 h-5 text-green-500" /> },
            { label: 'Total Tax', value: pnl.summary.total_tax, color: 'text-gray-600', icon: <FileText className="w-5 h-5 text-gray-500" /> },
            { label: 'Total Orders', value: pnl.summary.total_orders, color: 'text-blue-600', icon: <Receipt className="w-5 h-5 text-blue-500" />, isCurrency: false },
            { label: 'Total Expenses', value: pnl.summary.total_expenses, color: 'text-red-600', icon: <ArrowDownCircle className="w-5 h-5 text-red-500" /> },
            { label: 'Net Profit', value: pnl.summary.net_profit, color: pnl.summary.net_profit >= 0 ? 'text-green-600' : 'text-red-600', icon: <DollarSign className="w-5 h-5 text-purple-500" /> },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-gray-500">{s.label}</span></div>
                <p className={`text-xl font-bold ${s.color}`}>
                  {(s as any).isCurrency === false ? s.value : formatCurrency(Number(s.value))}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* P&L Breakdown Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Period Breakdown</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Period</th>
                    <th className="text-right p-3 font-medium text-gray-600">Revenue</th>
                    <th className="text-right p-3 font-medium text-gray-600">Orders</th>
                    <th className="text-right p-3 font-medium text-gray-600">Expenses</th>
                    <th className="text-right p-3 font-medium text-gray-600">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pnl?.rows && pnl.rows.length > 0 ? pnl.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-700">{formatPeriod(r.period, period)}</td>
                      <td className="p-3 text-right text-green-600 font-medium">{formatCurrency(r.revenue)}</td>
                      <td className="p-3 text-right text-gray-700">{r.orders}</td>
                      <td className="p-3 text-right text-red-600 font-medium">{formatCurrency(r.expenses)}</td>
                      <td className={`p-3 text-right font-bold ${r.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(r.net_profit)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">No data for this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Category-wise Expense Breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-base">Expense by Category</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pnl?.expense_breakdown && pnl.expense_breakdown.length > 0 ? (
              pnl.expense_breakdown.map(eb => {
                const badge = getCategoryBadge(eb.category)
                return (
                  <div key={eb.category} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                    <Badge className={badge.color}>{badge.label}</Badge>
                    <span className="font-semibold text-gray-900">{formatCurrency(eb.total)}</span>
                  </div>
                )
              })
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">No expenses in this period</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function formatPeriod(dateStr: string, period: string): string {
  try {
    const d = new Date(dateStr)
    if (period === 'hourly') return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    if (period === 'weekly') return `Week of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    if (period === 'monthly') return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

// ---------- Modal Forms ----------

function AddExpenseForm({ onClose, showToast, qc }: { onClose: () => void; showToast: (t: 'success' | 'error', m: string) => void; qc: any }) {
  const { currencyCode } = useCurrency()
  const [form, setForm] = useState({ category: 'other' as string, amount: '', description: '', expense_date: new Date().toISOString().slice(0, 10) })

  const mut = useMutation({
    mutationFn: () => apiClient.createExpense({ category: form.category, amount: parseFloat(form.amount), description: form.description || undefined, expense_date: form.expense_date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['currentDayStatus'] })
      qc.invalidateQueries({ queryKey: ['pnlReport'] })
      qc.invalidateQueries({ queryKey: ['expenseSummaryToday'] })
      showToast('success', 'Expense created')
      onClose()
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to create expense'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Add Expense</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {EXPENSE_CATEGORIES.filter(c => c.value !== 'inventory_purchase').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ({currencyCode})</label>
            <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g., Monthly electricity bill" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!form.amount || parseFloat(form.amount) <= 0 || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? 'Saving...' : 'Add Expense'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditExpenseForm({ expense, onClose, showToast, qc }: { expense: Expense; onClose: () => void; showToast: (t: 'success' | 'error', m: string) => void; qc: any }) {
  const { currencyCode } = useCurrency()
  const [form, setForm] = useState({ category: expense.category as string, amount: String(expense.amount), description: expense.description || '', expense_date: expense.expense_date })

  const mut = useMutation({
    mutationFn: () => apiClient.updateExpense(expense.id, { category: form.category, amount: parseFloat(form.amount), description: form.description || undefined, expense_date: form.expense_date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['currentDayStatus'] })
      qc.invalidateQueries({ queryKey: ['pnlReport'] })
      showToast('success', 'Expense updated')
      onClose()
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to update expense'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Edit Expense</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {EXPENSE_CATEGORIES.filter(c => c.value !== 'inventory_purchase').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ({currencyCode})</label>
            <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!form.amount || parseFloat(form.amount) <= 0 || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? 'Saving...' : 'Update Expense'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CloseDayForm({ dayStatus, onClose, showToast, qc }: { dayStatus: CurrentDayStatus; onClose: () => void; showToast: (t: 'success' | 'error', m: string) => void; qc: any }) {
  const { formatCurrency, currencyCode } = useCurrency()
  const [form, setForm] = useState({ opening_cash: '', actual_cash: '', notes: '' })
  const openingCash = parseFloat(form.opening_cash) || 0
  const expectedCash = openingCash + (dayStatus.cash_sales ?? 0)
  const actualCash = parseFloat(form.actual_cash) || 0
  const cashDiff = actualCash - expectedCash

  const mut = useMutation({
    mutationFn: () => apiClient.closeDay({ opening_cash: openingCash, actual_cash: actualCash, notes: form.notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currentDayStatus'] })
      qc.invalidateQueries({ queryKey: ['dailyClosings'] })
      qc.invalidateQueries({ queryKey: ['pnlReport'] })
      showToast('success', 'Day closed successfully!')
      onClose()
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to close day'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Close Day — {dayStatus.date}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        {/* Day Summary */}
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
          <div><p className="text-xs text-gray-500">Sales</p><p className="font-bold text-green-600">{formatCurrency(dayStatus.total_sales)}</p></div>
          <div><p className="text-xs text-gray-500">Expenses</p><p className="font-bold text-red-600">{formatCurrency(dayStatus.total_expenses)}</p></div>
          <div><p className="text-xs text-gray-500">Net Profit</p><p className={`font-bold ${dayStatus.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(dayStatus.net_profit)}</p></div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Opening Cash in Drawer ({currencyCode})</label>
            <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.opening_cash} onChange={e => setForm({ ...form, opening_cash: e.target.value })} placeholder="Amount at start of day" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Actual Cash in Drawer Now ({currencyCode})</label>
            <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.actual_cash} onChange={e => setForm({ ...form, actual_cash: e.target.value })} placeholder="Count the cash" />
          </div>

          {form.opening_cash && form.actual_cash && (
            <div className="p-3 bg-gray-50 rounded-lg space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Expected Cash:</span><span className="font-medium">{formatCurrency(expectedCash)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Actual Cash:</span><span className="font-medium">{formatCurrency(actualCash)}</span></div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-gray-500">Difference:</span>
                <span className={`font-bold ${cashDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{cashDiff >= 0 ? '+' : ''}{formatCurrency(cashDiff)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about the day..." />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 bg-orange-600 hover:bg-orange-700" disabled={!form.opening_cash || !form.actual_cash || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? 'Closing...' : 'Close Day'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ExpenseDashboard() {
  const qc = useQueryClient()
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = ++toastIdCounter
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const deleteExpenseMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['currentDayStatus'] })
      qc.invalidateQueries({ queryKey: ['pnlReport'] })
      showToast('success', 'Expense deleted')
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to delete expense'),
  })

  const [tab, setTab] = useState<Tab>('overview')
  const [modal, setModal] = useState<ModalState>({ kind: 'none' })

  const [expPage, setExpPage] = useState(1)
  const [expCategory, setExpCategory] = useState('')
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  const [expSearch, setExpSearch] = useState('')
  const [closingPage, setClosingPage] = useState(1)
  const [pnlPeriod, setPnlPeriod] = useState<string>('daily')
  const [pnlFrom, setPnlFrom] = useState('')
  const [pnlTo, setPnlTo] = useState('')

  const { data: currentDay } = useQuery({ queryKey: ['currentDayStatus'], queryFn: () => apiClient.getCurrentDayStatus() })
  const { data: expensesRes } = useQuery({
    queryKey: ['expenses', expPage, expCategory, expFrom, expTo, expSearch],
    queryFn: () => apiClient.getExpenses({ page: expPage, per_page: 15, category: expCategory || undefined, from: expFrom || undefined, to: expTo || undefined, search: expSearch || undefined }),
  })
  const { data: closingsRes } = useQuery({
    queryKey: ['dailyClosings', closingPage],
    queryFn: () => apiClient.getDailyClosings({ page: closingPage, per_page: 10 }),
  })
  const { data: pnlRes } = useQuery({
    queryKey: ['pnlReport', pnlPeriod, pnlFrom, pnlTo],
    queryFn: () => apiClient.getPnLReport({ period: pnlPeriod, from: pnlFrom || undefined, to: pnlTo || undefined }),
  })

  const dayStatus = currentDay?.data as CurrentDayStatus | undefined
  const expenses = (expensesRes as any)?.data as Expense[] | undefined
  const expMeta = (expensesRes as any)?.meta
  const closings = (closingsRes as any)?.data as DailyClosing[] | undefined
  const closingMeta = (closingsRes as any)?.meta
  const pnl = pnlRes?.data as PnLReport | undefined

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'expenses', label: 'Expenses', icon: <Receipt className="w-4 h-4" /> },
    { key: 'closing', label: 'Daily Closing', icon: <Calendar className="w-4 h-4" /> },
    { key: 'pnl', label: 'P&L Reports', icon: <TrendingUp className="w-4 h-4" /> },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Track expenses, close days, and view P&L reports</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab dayStatus={dayStatus} pnl={pnl} />}
      {tab === 'expenses' && (
        <ExpensesTab expenses={expenses} meta={expMeta} page={expPage} setPage={setExpPage}
          category={expCategory} setCategory={setExpCategory} from={expFrom} setFrom={setExpFrom}
          to={expTo} setTo={setExpTo} search={expSearch} setSearch={setExpSearch}
          onAdd={() => setModal({ kind: 'addExpense' })} onEdit={(e) => setModal({ kind: 'editExpense', expense: e })}
          onDelete={(id) => deleteExpenseMut.mutate(id)} />
      )}
      {tab === 'closing' && (
        <ClosingTab dayStatus={dayStatus} closings={closings} meta={closingMeta}
          page={closingPage} setPage={setClosingPage} onClose={() => setModal({ kind: 'closeDay' })} />
      )}
      {tab === 'pnl' && (
        <PnLTab pnl={pnl} period={pnlPeriod} setPeriod={setPnlPeriod}
          from={pnlFrom} setFrom={setPnlFrom} to={pnlTo} setTo={setPnlTo} />
      )}

      {modal.kind === 'addExpense' && <AddExpenseForm onClose={() => setModal({ kind: 'none' })} showToast={showToast} qc={qc} />}
      {modal.kind === 'editExpense' && <EditExpenseForm expense={modal.expense} onClose={() => setModal({ kind: 'none' })} showToast={showToast} qc={qc} />}
      {modal.kind === 'closeDay' && dayStatus && <CloseDayForm dayStatus={dayStatus} onClose={() => setModal({ kind: 'none' })} showToast={showToast} qc={qc} />}

      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm ${t.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {t.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
