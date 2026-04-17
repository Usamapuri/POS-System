import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { Expense, MetaData } from '@/types'
import { formatRecordedAtForLedger, getCategoryBadge } from './expense-constants'
import { useExpenseCategoryDefs } from './use-expense-category-defs'
import { toastHelpers } from '@/lib/toast-helpers'
import { Search, X, ChevronLeft, ChevronRight, Plus, Lock, Download } from 'lucide-react'

function csvEscape(value: string | number | undefined | null): string {
  const s = value === undefined || value === null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCurrentPageExpensesCsv(rows: Expense[], page: number) {
  if (!rows.length) {
    toastHelpers.warning('Nothing to export', 'There are no rows on this page.')
    return
  }
  const header = ['recorded_at', 'expense_date', 'category', 'amount', 'description', 'created_by_name', 'reference_type', 'entry_type']
  const lines = [header.join(',')]
  for (const e of rows) {
    lines.push(
      [
        csvEscape(e.recorded_at ?? ''),
        csvEscape(e.expense_date),
        csvEscape(e.category),
        csvEscape(e.amount),
        csvEscape(e.description ?? ''),
        csvEscape(e.created_by_name ?? ''),
        csvEscape(e.reference_type ?? ''),
        csvEscape(e.reference_type ? 'auto' : 'manual'),
      ].join(',')
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `expenses-page-${page}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export type ExpenseLedgerSortKey = 'expense_date' | 'amount' | 'category' | 'created_at'

type Props = {
  expenses?: Expense[]
  meta?: MetaData
  page: number
  setPage: (p: number) => void
  category: string
  setCategory: (c: string) => void
  from: string
  setFrom: (f: string) => void
  to: string
  setTo: (t: string) => void
  searchInput: string
  onSearchInputChange: (s: string) => void
  sortBy: ExpenseLedgerSortKey
  setSortBy: (k: ExpenseLedgerSortKey) => void
  sortDir: 'asc' | 'desc'
  setSortDir: (d: 'asc' | 'desc') => void
  onAdd: () => void
  onEdit: (e: Expense) => void
  onDelete: (id: string) => void
  onManageCategories?: () => void
}

export function ExpenseLedgerTab({
  expenses,
  meta,
  page,
  setPage,
  category,
  setCategory,
  from,
  setFrom,
  to,
  setTo,
  searchInput,
  onSearchInputChange,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  onAdd,
  onEdit,
  onDelete,
  onManageCategories,
}: Props) {
  const { formatCurrency } = useCurrency()
  const { data: categoryDefs = [] } = useExpenseCategoryDefs()
  const filterCategories = [...categoryDefs]
    .filter(d => d.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search description…"
            value={searchInput}
            onChange={e => onSearchInputChange(e.target.value)}
          />
        </div>
        <Select
          value={category || '__all__'}
          onValueChange={v => {
            setCategory(v === '__all__' ? '' : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {filterCategories.map(c => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            className="w-[160px]"
            value={from}
            onChange={e => {
              setFrom(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input
            type="date"
            className="w-[160px]"
            value={to}
            onChange={e => {
              setTo(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select value={sortBy} onValueChange={v => setSortBy(v as ExpenseLedgerSortKey)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expense_date">Date</SelectItem>
            <SelectItem value="amount">Amount</SelectItem>
            <SelectItem value="category">Category</SelectItem>
            <SelectItem value="created_at">Created</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortDir}
          onValueChange={v => {
            setSortDir(v as 'asc' | 'desc')
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Desc</SelectItem>
            <SelectItem value="asc">Asc</SelectItem>
          </SelectContent>
        </Select>
        {(category || from || to || searchInput.trim()) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCategory('')
              setFrom('')
              setTo('')
              onSearchInputChange('')
              setPage(1)
            }}
          >
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
        <div className="ml-auto flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadCurrentPageExpensesCsv(expenses ?? [], page)}
          >
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
          {onManageCategories && (
            <Button type="button" variant="outline" size="sm" onClick={onManageCategories}>
              Categories
            </Button>
          )}
          <Button type="button" onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" />
            Add expense
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="max-h-[min(70vh,640px)] overflow-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="sticky top-0 z-30 border-b bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/75">
              <tr>
                <th className="p-3 text-left font-medium text-muted-foreground">Date &amp; time</th>
                <th className="p-3 text-left font-medium text-muted-foreground">Category</th>
                <th className="p-3 text-left font-medium text-muted-foreground">Description</th>
                <th className="p-3 text-right font-medium text-muted-foreground">Amount</th>
                <th className="p-3 text-left font-medium text-muted-foreground">Created by</th>
                <th className="p-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="sticky right-0 z-20 min-w-[148px] border-l bg-muted/95 p-3 text-right font-medium text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/75">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {expenses && expenses.length > 0 ? (
                expenses.map(e => {
                  const badge = getCategoryBadge(e.category, categoryDefs)
                  const isAutoLinked = !!e.reference_type
                  return (
                    <tr key={e.id} className="hover:bg-muted/40">
                      <td className="p-3 tabular-nums text-muted-foreground">
                        {formatRecordedAtForLedger(e.recorded_at, e.expense_date)}
                      </td>
                      <td className="p-3">
                        <Badge className={badge.color}>{badge.label}</Badge>
                      </td>
                      <td className="max-w-xs truncate p-3">{e.description || '—'}</td>
                      <td className="p-3 text-right font-semibold text-destructive tabular-nums">
                        {formatCurrency(e.amount)}
                      </td>
                      <td className="p-3 text-muted-foreground">{e.created_by_name || '—'}</td>
                      <td className="p-3">
                        {isAutoLinked ? (
                          <Badge variant="secondary" className="gap-1">
                            <Lock className="h-3 w-3" />
                            Auto
                          </Badge>
                        ) : (
                          <Badge variant="outline">Manual</Badge>
                        )}
                      </td>
                      <td className="sticky right-0 z-10 border-l bg-background/95 p-3 text-right backdrop-blur supports-[backdrop-filter]:bg-background/80">
                        {!isAutoLinked ? (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => onEdit(e)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => onDelete(e.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Read-only</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    No expenses found
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
            Page {meta.current_page} of {meta.total_pages} ({meta.total} total)
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
