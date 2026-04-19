import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import apiClient from '@/api/client'
import type { UseReportRange } from '@/hooks/useReportRange'
import type { DailySalesRow } from '@/types'
import { useCurrency } from '@/contexts/CurrencyContext'
import { ExportButton } from './ExportButton'
import { ReportsExportSlot } from './ReportsExportSlot'
import { openPrintableReport, escapeHtml } from '@/lib/printReport'
import { useBusinessNameWithFallback } from '@/hooks/useBusinessName'
import { formatDateDDMMYYYY } from '@/lib/utils'

type SortKey = 'date' | 'orders' | 'covers' | 'net' | 'gross' | 'discounts' | 'tax'
type SortDir = 'asc' | 'desc'

interface Props {
  range: UseReportRange
}

export function DailySalesTab({ range }: Props) {
  const { formatCurrency } = useCurrency()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const dailyQuery = useQuery({
    queryKey: ['reports-v2', 'daily', range.fromISO, range.toISO],
    queryFn: () => apiClient.getDailySalesReport(range.fromISO, range.toISO),
    staleTime: 30_000,
  })

  const allRows = dailyQuery.data?.data ?? []

  const sorted = useMemo(() => {
    const filtered = search.trim()
      ? allRows.filter((r) => r.date_label.includes(search.trim()) || r.date.includes(search.trim()))
      : allRows
    const dir = sortDir === 'asc' ? 1 : -1
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = sortKey === 'date' ? a.date : (a as unknown as Record<SortKey, number>)[sortKey]
      const bv = sortKey === 'date' ? b.date : (b as unknown as Record<SortKey, number>)[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir
      return ((av as number) - (bv as number)) * dir
    })
    return copy
  }, [allRows, search, sortKey, sortDir])

  const totals = useMemo(() => {
    return sorted.reduce(
      (acc, r) => ({
        orders: acc.orders + r.orders,
        covers: acc.covers + r.covers,
        gross: acc.gross + r.gross,
        discounts: acc.discounts + r.discounts,
        net: acc.net + r.net,
        tax: acc.tax + r.tax,
      }),
      { orders: 0, covers: 0, gross: 0, discounts: 0, net: 0, tax: 0 },
    )
  }, [sorted])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'date' ? 'desc' : 'desc')
    }
  }

  const headerSort = (label: string, k: SortKey, alignRight = false) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={`group inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground ${alignRight ? 'justify-end w-full' : ''}`}
    >
      {label}
      {sortKey === k ? (
        sortDir === 'asc' ? (
          <ArrowUp className="w-3 h-3" />
        ) : (
          <ArrowDown className="w-3 h-3" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-80" />
      )}
    </button>
  )

  const brand = useBusinessNameWithFallback()
  const handlePrintPdf = () => {
    openPrintableReport({
      title: 'Daily Sales',
      subtitle: `${formatDateDDMMYYYY(range.from)} → ${formatDateDDMMYYYY(range.to)} • Asia/Karachi`,
      bodyHtml: buildDailyPdf(sorted, totals, formatCurrency),
      brand,
    })
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs w-full">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search a day (e.g. 18-04-2026)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <ReportsExportSlot>
        <ExportButton
          report="daily_sales"
          reportLabel="Daily sales"
          fromISO={range.fromISO}
          toISO={range.toISO}
          onPrintPdf={handlePrintPdf}
        />
      </ReportsExportSlot>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Daily sales — {formatDateDDMMYYYY(range.from)} → {formatDateDDMMYYYY(range.to)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {dailyQuery.isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No sales in this range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5">{headerSort('Date', 'date')}</th>
                    <th className="text-right px-4 py-2.5">{headerSort('Orders', 'orders', true)}</th>
                    <th className="text-right px-4 py-2.5">{headerSort('Covers', 'covers', true)}</th>
                    <th className="text-right px-4 py-2.5">{headerSort('Gross', 'gross', true)}</th>
                    <th className="text-right px-4 py-2.5">{headerSort('Discounts', 'discounts', true)}</th>
                    <th className="text-right px-4 py-2.5">{headerSort('Net', 'net', true)}</th>
                    <th className="text-right px-4 py-2.5">{headerSort('Tax', 'tax', true)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sorted.map((row) => (
                    <DailyRow key={row.date} row={row} formatCurrency={formatCurrency} range={range} />
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-semibold">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td className="text-right tabular-nums px-4 py-3">{totals.orders.toLocaleString('en-US')}</td>
                    <td className="text-right tabular-nums px-4 py-3">{totals.covers.toLocaleString('en-US')}</td>
                    <td className="text-right tabular-nums px-4 py-3">{formatCurrency(totals.gross)}</td>
                    <td className="text-right tabular-nums px-4 py-3">{formatCurrency(totals.discounts)}</td>
                    <td className="text-right tabular-nums px-4 py-3">{formatCurrency(totals.net)}</td>
                    <td className="text-right tabular-nums px-4 py-3">{formatCurrency(totals.tax)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DailyRow({
  row,
  formatCurrency,
  range,
}: {
  row: DailySalesRow
  formatCurrency: (n: number) => string
  range: UseReportRange
}) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="px-4 py-3 font-medium tabular-nums">
        <div className="flex items-center gap-2">
          <span>{row.date_label}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              const d = new Date(`${row.date}T00:00:00`)
              if (!Number.isNaN(d.getTime())) {
                range.setRange({ from: d, to: d, preset: 'custom' })
              }
            }}
          >
            Drill in
          </Button>
        </div>
      </td>
      <td className="text-right tabular-nums px-4 py-3">{row.orders.toLocaleString('en-US')}</td>
      <td className="text-right tabular-nums px-4 py-3">{row.covers.toLocaleString('en-US')}</td>
      <td className="text-right tabular-nums px-4 py-3">{formatCurrency(row.gross)}</td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">
        {row.discounts > 0 ? formatCurrency(row.discounts) : '—'}
      </td>
      <td className="text-right tabular-nums px-4 py-3 font-semibold">{formatCurrency(row.net)}</td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">{formatCurrency(row.tax)}</td>
    </tr>
  )
}

function buildDailyPdf(
  rows: DailySalesRow[],
  totals: { orders: number; covers: number; gross: number; discounts: number; net: number; tax: number },
  formatCurrency: (n: number) => string,
): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.date_label)}</td><td class="num">${r.orders}</td><td class="num">${r.covers}</td><td class="num">${escapeHtml(formatCurrency(r.gross))}</td><td class="num">${escapeHtml(formatCurrency(r.discounts))}</td><td class="num">${escapeHtml(formatCurrency(r.net))}</td><td class="num">${escapeHtml(formatCurrency(r.tax))}</td></tr>`,
    )
    .join('')
  return `
    <table>
      <thead><tr>
        <th>Date</th><th class="num">Orders</th><th class="num">Covers</th><th class="num">Gross</th>
        <th class="num">Discounts</th><th class="num">Net</th><th class="num">Tax</th>
      </tr></thead>
      <tbody>${body || `<tr><td colspan="7" class="muted">No sales</td></tr>`}</tbody>
      <tfoot><tr>
        <th>Total</th>
        <th class="num">${totals.orders}</th>
        <th class="num">${totals.covers}</th>
        <th class="num">${escapeHtml(formatCurrency(totals.gross))}</th>
        <th class="num">${escapeHtml(formatCurrency(totals.discounts))}</th>
        <th class="num">${escapeHtml(formatCurrency(totals.net))}</th>
        <th class="num">${escapeHtml(formatCurrency(totals.tax))}</th>
      </tr></tfoot>
    </table>
  `
}
