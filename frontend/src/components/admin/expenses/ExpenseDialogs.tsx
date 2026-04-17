import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { Expense, CurrentDayStatus } from '@/types'
import { useCurrency } from '@/contexts/CurrencyContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EXPENSE_CATEGORIES, formatLocalYMD } from './expense-constants'
import { toastHelpers } from '@/lib/toast-helpers'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

function invalidateExpenseQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['expenses'] })
  qc.invalidateQueries({ queryKey: ['currentDayStatus'] })
  qc.invalidateQueries({ queryKey: ['pnlReport'] })
  qc.invalidateQueries({ queryKey: ['expenseSummary'] })
  qc.invalidateQueries({ queryKey: ['dailyClosings'] })
  qc.invalidateQueries({ queryKey: ['expenseIntelligence'] })
}

export function AddExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const { currencyCode } = useCurrency()

  const [form, setForm] = useState({
    category: 'other',
    amount: '',
    description: '',
    expense_date: formatLocalYMD(new Date()),
  })

  useEffect(() => {
    if (open) {
      setForm(f => ({ ...f, expense_date: formatLocalYMD(new Date()) }))
    }
  }, [open])

  const mut = useMutation({
    mutationFn: () =>
      apiClient.createExpense({
        category: form.category,
        amount: parseFloat(form.amount),
        description: form.description || undefined,
        expense_date: form.expense_date,
      }),
    onSuccess: () => {
      invalidateExpenseQueries(qc)
      toastHelpers.success('Expense added')
      onOpenChange(false)
      setForm({
        category: 'other',
        amount: '',
        description: '',
        expense_date: formatLocalYMD(new Date()),
      })
    },
    onError: (err: Error) => toastHelpers.apiError('Add expense', err),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.filter(c => c.value !== 'inventory_purchase').map(c => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Amount ({currencyCode})</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Monthly electricity"
            />
          </div>
          <div className="grid gap-2">
            <Label>Date</Label>
            <Input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!form.amount || parseFloat(form.amount) <= 0 || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? 'Saving…' : 'Add expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EditExpenseDialog({
  expense,
  onClose,
}: {
  expense: Expense | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { currencyCode } = useCurrency()
  const [form, setForm] = useState({
    category: 'other',
    amount: '',
    description: '',
    expense_date: formatLocalYMD(new Date()),
  })

  useEffect(() => {
    if (!expense) return
    setForm({
      category: expense.category,
      amount: String(expense.amount),
      description: expense.description || '',
      expense_date: expense.expense_date,
    })
  }, [expense])

  const mut = useMutation({
    mutationFn: () => {
      if (!expense) return Promise.reject(new Error('No expense'))
      return apiClient.updateExpense(expense.id, {
        category: form.category,
        amount: parseFloat(form.amount),
        description: form.description || undefined,
        expense_date: form.expense_date,
      })
    },
    onSuccess: () => {
      invalidateExpenseQueries(qc)
      toastHelpers.success('Expense updated')
      onClose()
    },
    onError: (err: Error) => toastHelpers.apiError('Update expense', err),
  })

  return (
    <Dialog open={!!expense} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
        </DialogHeader>
        {expense && (
          <>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.filter(c => c.value !== 'inventory_purchase').map(c => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Amount ({currencyCode})</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Date</Label>
                <Input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onClose()}>
                Cancel
              </Button>
              <Button
                disabled={!form.amount || parseFloat(form.amount) <= 0 || mut.isPending}
                onClick={() => mut.mutate()}
              >
                {mut.isPending ? 'Saving…' : 'Update'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function CloseDayDialog({
  dayStatus,
  open,
  onOpenChange,
}: {
  dayStatus: CurrentDayStatus | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const { formatCurrency, currencyCode } = useCurrency()
  const [form, setForm] = useState({ opening_cash: '', actual_cash: '', notes: '' })

  const openingCash = parseFloat(form.opening_cash) || 0
  const expectedCash = dayStatus ? openingCash + (dayStatus.cash_sales ?? 0) : 0
  const actualCash = parseFloat(form.actual_cash) || 0
  const cashDiff = actualCash - expectedCash

  const mut = useMutation({
    mutationFn: () => apiClient.closeDay({ opening_cash: openingCash, actual_cash: actualCash, notes: form.notes || undefined }),
    onSuccess: () => {
      invalidateExpenseQueries(qc)
      toastHelpers.success('Day closed')
      onOpenChange(false)
      setForm({ opening_cash: '', actual_cash: '', notes: '' })
    },
    onError: (err: Error) => toastHelpers.apiError('Close day', err),
  })

  if (!dayStatus) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Close day — {dayStatus.date}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Sales</p>
            <p className="font-bold text-emerald-600">{formatCurrency(dayStatus.total_sales)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Expenses</p>
            <p className="font-bold text-destructive">{formatCurrency(dayStatus.total_expenses)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net profit</p>
            <p className={`font-bold ${dayStatus.net_profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
              {formatCurrency(dayStatus.net_profit)}
            </p>
          </div>
        </div>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Opening cash ({currencyCode})</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.opening_cash}
              onChange={e => setForm({ ...form, opening_cash: e.target.value })}
              placeholder="Drawer at start of day"
            />
          </div>
          <div className="grid gap-2">
            <Label>Actual cash now ({currencyCode})</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.actual_cash}
              onChange={e => setForm({ ...form, actual_cash: e.target.value })}
              placeholder="Physical count"
            />
          </div>
          {form.opening_cash && form.actual_cash && (
            <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected cash</span>
                <span className="font-medium tabular-nums">{formatCurrency(expectedCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual cash</span>
                <span className="font-medium tabular-nums">{formatCurrency(actualCash)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-muted-foreground">Difference</span>
                <span className={`font-bold tabular-nums ${cashDiff >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  {cashDiff >= 0 ? '+' : ''}
                  {formatCurrency(cashDiff)}
                </span>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-orange-600 hover:bg-orange-700"
            disabled={!form.opening_cash || !form.actual_cash || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Closing…' : 'Close day'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
