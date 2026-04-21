import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type {
  Expense,
  DailyClosing,
  PnLReport,
  CurrentDayStatus,
  ExpenseIntelligenceReport,
  ExpenseSummary,
  MetaData,
} from '@/types'
import { cn } from '@/lib/utils'
import { toastHelpers } from '@/lib/toast-helpers'
import { Skeleton } from '@/components/ui/skeleton'
import { ExpenseOverviewTab } from '@/components/admin/expenses/ExpenseOverviewTab'
import { ExpenseLedgerTab, type ExpenseLedgerSortKey } from '@/components/admin/expenses/ExpenseLedgerTab'
import { ExpenseClosingTab } from '@/components/admin/expenses/ExpenseClosingTab'
import { ExpensePnLTab } from '@/components/admin/expenses/ExpensePnLTab'
import { ExpenseIntelligenceTab } from '@/components/admin/expenses/ExpenseIntelligenceTab'
import { AddExpenseDialog, EditExpenseDialog, CloseDayDialog } from '@/components/admin/expenses/ExpenseDialogs'
import { ManageExpenseCategoriesDialog } from '@/components/admin/expenses/ManageExpenseCategoriesDialog'
import { getMonthToDateRange, getLastNDaysInclusive } from '@/components/admin/expenses/expense-constants'
import {
  BarChart3,
  Receipt,
  Calendar,
  TrendingUp,
  Sparkles,
} from 'lucide-react'

type Tab = 'overview' | 'expenses' | 'closing' | 'pnl' | 'intelligence'

export function ExpenseDashboard() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')

  const mtdRange = useMemo(() => getMonthToDateRange(), [])
  const weekRange = useMemo(() => getLastNDaysInclusive(7), [])
  const overviewRangeLabel = `Month to date (${mtdRange.from} → ${mtdRange.to})`

  const { data: currentDay, isLoading: dayLoading } = useQuery({
    queryKey: ['currentDayStatus'],
    queryFn: () => apiClient.getCurrentDayStatus(),
    staleTime: 30_000,
  })

  const { data: overviewPnLRes, isFetching: overviewPnLLoading } = useQuery({
    queryKey: ['pnlReport', 'overview-mtd', mtdRange.from, mtdRange.to],
    queryFn: () => apiClient.getPnLReport({ period: 'daily', from: mtdRange.from, to: mtdRange.to }),
    enabled: tab === 'overview',
    staleTime: 60_000,
  })

  const { data: mtdExpenseSummaryRes, isFetching: mtdSummaryLoading } = useQuery({
    queryKey: ['expenseSummary', 'mtd', mtdRange.from, mtdRange.to],
    queryFn: () => apiClient.getExpenseSummary({ from: mtdRange.from, to: mtdRange.to }),
    enabled: tab === 'overview',
    staleTime: 60_000,
  })

  const { data: weekPnLRes, isFetching: weekPnLLoading } = useQuery({
    queryKey: ['pnlReport', 'overview-week-net', weekRange.from, weekRange.to],
    queryFn: () => apiClient.getPnLReport({ period: 'daily', from: weekRange.from, to: weekRange.to }),
    enabled: tab === 'overview',
    staleTime: 60_000,
  })

  const [expPage, setExpPage] = useState(1)
  const [expCategory, setExpCategory] = useState('')
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  const [expSearchInput, setExpSearchInput] = useState('')
  const [debouncedExpSearch, setDebouncedExpSearch] = useState('')
  const [sortBy, setSortBy] = useState<ExpenseLedgerSortKey>('expense_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedExpSearch(expSearchInput.trim()), 300)
    return () => window.clearTimeout(id)
  }, [expSearchInput])

  useEffect(() => {
    setExpPage(1)
  }, [debouncedExpSearch])

  const { data: expensesRes, isFetching: expLoading } = useQuery({
    queryKey: ['expenses', expPage, expCategory, expFrom, expTo, debouncedExpSearch, sortBy, sortDir],
    queryFn: () =>
      apiClient.getExpenses({
        page: expPage,
        per_page: 15,
        category: expCategory || undefined,
        from: expFrom || undefined,
        to: expTo || undefined,
        search: debouncedExpSearch || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      }),
    enabled: tab === 'expenses',
  })

  const [closingPage, setClosingPage] = useState(1)
  const { data: closingsRes } = useQuery({
    queryKey: ['dailyClosings', closingPage],
    queryFn: () => apiClient.getDailyClosings({ page: closingPage, per_page: 10 }),
    enabled: tab === 'closing',
  })

  const [pnlPeriod, setPnlPeriod] = useState('daily')
  const [pnlFrom, setPnlFrom] = useState('')
  const [pnlTo, setPnlTo] = useState('')
  const { data: pnlRes, isFetching: pnlLoading } = useQuery({
    queryKey: ['pnlReport', 'main', pnlPeriod, pnlFrom, pnlTo],
    queryFn: () => apiClient.getPnLReport({ period: pnlPeriod, from: pnlFrom || undefined, to: pnlTo || undefined }),
    enabled: tab === 'pnl',
    staleTime: 30_000,
  })

  const [intelPeriod, setIntelPeriod] = useState('30')
  const { data: intelRes, isFetching: intelLoading } = useQuery({
    queryKey: ['expenseIntelligence', intelPeriod],
    queryFn: () => apiClient.getExpenseIntelligence({ period_days: Number(intelPeriod) }),
    enabled: tab === 'intelligence',
    staleTime: 30_000,
  })

  const [addOpen, setAddOpen] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [closeOpen, setCloseOpen] = useState(false)
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false)

  const deleteExpenseMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['currentDayStatus'] })
      qc.invalidateQueries({ queryKey: ['pnlReport'] })
      qc.invalidateQueries({ queryKey: ['expenseSummary'] })
      qc.invalidateQueries({ queryKey: ['dailyClosings'] })
      qc.invalidateQueries({ queryKey: ['expenseIntelligence'] })
      toastHelpers.success('Expense deleted')
    },
    onError: (err: Error) => toastHelpers.apiError('Delete expense', err),
  })

  const dayStatus = currentDay?.data as CurrentDayStatus | undefined
  const expenses = (expensesRes as { data?: Expense[] })?.data
  const expMeta = (expensesRes as { meta?: MetaData })?.meta
  const closings = (closingsRes as { data?: DailyClosing[] })?.data
  const closingMeta = (closingsRes as { meta?: MetaData })?.meta
  const pnl = pnlRes?.data as PnLReport | undefined
  const overviewPnL = overviewPnLRes?.data as PnLReport | undefined
  const mtdExpenseSummary = mtdExpenseSummaryRes?.data as ExpenseSummary | undefined
  const weekPnL = weekPnLRes?.data as PnLReport | undefined
  const intel = intelRes?.data as ExpenseIntelligenceReport | undefined

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'expenses', label: 'Expenses', icon: <Receipt className="h-4 w-4" /> },
    { key: 'closing', label: 'Daily closing', icon: <Calendar className="h-4 w-4" /> },
    { key: 'pnl', label: 'P&L reports', icon: <TrendingUp className="h-4 w-4" /> },
    { key: 'intelligence', label: 'Intelligence', icon: <Sparkles className="h-4 w-4" /> },
  ]

  const showOverviewSkeleton =
    tab === 'overview' && (dayLoading || overviewPnLLoading || mtdSummaryLoading || weekPnLLoading)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Expense Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Track expenses, close days, and view P&amp;L — revenue aligns with completed orders (same basis as daily
          closing)
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {showOverviewSkeleton ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      ) : (
        tab === 'overview' && (
          <ExpenseOverviewTab
            dayStatus={dayStatus}
            overviewPnL={overviewPnL}
            overviewRangeLabel={overviewRangeLabel}
            mtdExpenseSummary={mtdExpenseSummary}
            weekPnL={weekPnL}
            weekRangeLabel={`Last 7 days (${weekRange.from} → ${weekRange.to})`}
          />
        )
      )}

      {tab === 'expenses' && (
        <>
          {expLoading && !expenses?.length ? (
            <Skeleton className="h-96" />
          ) : (
            <ExpenseLedgerTab
              expenses={expenses}
              meta={expMeta}
              page={expPage}
              setPage={setExpPage}
              category={expCategory}
              setCategory={setExpCategory}
              from={expFrom}
              setFrom={setExpFrom}
              to={expTo}
              setTo={setExpTo}
              searchInput={expSearchInput}
              onSearchInputChange={setExpSearchInput}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortDir={sortDir}
              setSortDir={setSortDir}
              onAdd={() => setAddOpen(true)}
              onEdit={e => setEditExpense(e)}
              onDelete={id => deleteExpenseMut.mutate(id)}
              onManageCategories={() => setManageCategoriesOpen(true)}
            />
          )}
        </>
      )}

      {tab === 'closing' && (
        <ExpenseClosingTab
          dayStatus={dayStatus}
          closings={closings}
          meta={closingMeta}
          page={closingPage}
          setPage={setClosingPage}
          onClose={() => setCloseOpen(true)}
        />
      )}

      {tab === 'pnl' && (
        <>
          {pnlLoading && !pnl ? (
            <Skeleton className="h-[480px]" />
          ) : (
            <ExpensePnLTab
              pnl={pnl}
              period={pnlPeriod}
              setPeriod={setPnlPeriod}
              from={pnlFrom}
              setFrom={setPnlFrom}
              to={pnlTo}
              setTo={setPnlTo}
            />
          )}
        </>
      )}

      {tab === 'intelligence' && (
        <ExpenseIntelligenceTab
          report={intel}
          loading={intelLoading && !intel}
          periodDays={intelPeriod}
          setPeriodDays={setIntelPeriod}
        />
      )}

      <AddExpenseDialog open={addOpen} onOpenChange={setAddOpen} onManageCategories={() => setManageCategoriesOpen(true)} />
      <EditExpenseDialog expense={editExpense} onClose={() => setEditExpense(null)} onManageCategories={() => setManageCategoriesOpen(true)} />
      <ManageExpenseCategoriesDialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen} />
      <CloseDayDialog dayStatus={dayStatus ?? null} open={closeOpen} onOpenChange={setCloseOpen} />
    </div>
  )
}
