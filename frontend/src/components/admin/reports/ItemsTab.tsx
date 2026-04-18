import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
} from 'recharts'
import { Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import apiClient from '@/api/client'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { UseReportRange } from '@/hooks/useReportRange'
import type { Category, ItemSalesRow } from '@/types'
import { ExportButton } from './ExportButton'
import { openPrintableReport, escapeHtml } from '@/lib/printReport'
import { formatDateDDMMYYYY } from '@/lib/utils'

type SortKey = 'qty' | 'gross' | 'net'

interface Props {
  range: UseReportRange
}

export function ItemsTab({ range }: Props) {
  const { formatCurrency } = useCurrency()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('net')

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.getCategories(),
    staleTime: 60_000,
  })
  const categories = (categoriesQuery.data?.data as Category[] | undefined) ?? []

  const itemsQuery = useQuery({
    queryKey: ['reports-v2', 'items', range.fromISO, range.toISO, search, categoryId, sortKey],
    queryFn: () =>
      apiClient.getItemSalesReport(range.fromISO, range.toISO, {
        search: search.trim() || undefined,
        category_id: categoryId === 'all' ? undefined : categoryId,
        sort: sortKey,
        limit: 1000,
      }),
    staleTime: 30_000,
  })

  const items = itemsQuery.data?.data ?? []
  const totals = useMemo(
    () => items.reduce((acc, r) => ({ qty: acc.qty + r.qty_sold, net: acc.net + r.net }), { qty: 0, net: 0 }),
    [items],
  )
  const top = useMemo(() => items.slice(0, 10), [items])

  const handlePrintPdf = () => {
    openPrintableReport({
      title: 'Item Sales',
      subtitle: `${formatDateDDMMYYYY(range.from)} → ${formatDateDDMMYYYY(range.to)} • Asia/Karachi`,
      bodyHtml: buildItemsPdf(items, totals, formatCurrency),
    })
  }

  const exportExtraParams = useMemo(() => {
    const x: Record<string, string> = {}
    if (search.trim()) x.search = search.trim()
    if (categoryId !== 'all') x.category_id = categoryId
    return x
  }, [search, categoryId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search item name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-md bg-muted p-1">
            {(['net', 'gross', 'qty'] as SortKey[]).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={sortKey === k ? 'default' : 'ghost'}
                className="h-7 px-3 text-xs"
                onClick={() => setSortKey(k)}
              >
                Sort: {k === 'qty' ? 'Quantity' : k === 'gross' ? 'Gross' : 'Net'}
              </Button>
            ))}
          </div>
        </div>
        <ExportButton
          report="items"
          reportLabel="Item sales"
          fromISO={range.fromISO}
          toISO={range.toISO}
          extraParams={exportExtraParams}
          onPrintPdf={handlePrintPdf}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 by {sortKey === 'qty' ? 'quantity sold' : sortKey === 'gross' ? 'gross sales' : 'net sales'}</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          {itemsQuery.isLoading ? (
            <Skeleton className="w-full h-full" />
          ) : top.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No item sales in this range
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" margin={{ top: 8, right: 24, left: 16, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.18)" horizontal={false} />
                <XAxis
                  type="number"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    sortKey === 'qty' ? String(v) : formatCompact(v)
                  }
                />
                <YAxis dataKey="name" type="category" fontSize={11} tickLine={false} axisLine={false} width={140} />
                <ReTooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) =>
                    sortKey === 'qty' ? [v, 'Qty'] : [formatCurrency(v), sortKey === 'gross' ? 'Gross' : 'Net']
                  }
                />
                <Bar dataKey={sortKey === 'qty' ? 'qty_sold' : sortKey} fill="#0ea5e9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>All items ({items.length})</span>
            {totals.qty > 0 && (
              <Badge variant="outline" className="text-xs">
                Total qty: {totals.qty.toLocaleString('en-US')} • Net: {formatCurrency(totals.net)}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {itemsQuery.isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No items match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5">Item</th>
                    <th className="text-left px-4 py-2.5">Category</th>
                    <th className="text-right px-4 py-2.5">Qty</th>
                    <th className="text-right px-4 py-2.5">Avg unit price</th>
                    <th className="text-right px-4 py-2.5">Gross</th>
                    <th className="text-right px-4 py-2.5">Net</th>
                    <th className="text-right px-4 py-2.5">% of net</th>
                    <th className="text-right px-4 py-2.5">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((row) => (
                    <ItemsRow key={row.product_id} row={row} formatCurrency={formatCurrency} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ItemsRow({ row, formatCurrency }: { row: ItemSalesRow; formatCurrency: (n: number) => string }) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="px-4 py-3 font-medium">{row.name}</td>
      <td className="px-4 py-3 text-muted-foreground">{row.category ?? '—'}</td>
      <td className="text-right tabular-nums px-4 py-3">{row.qty_sold.toLocaleString('en-US')}</td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">{formatCurrency(row.avg_unit_price)}</td>
      <td className="text-right tabular-nums px-4 py-3">{formatCurrency(row.gross)}</td>
      <td className="text-right tabular-nums px-4 py-3 font-semibold">{formatCurrency(row.net)}</td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">{row.percent_of_net.toFixed(1)}%</td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">{row.orders_count.toLocaleString('en-US')}</td>
    </tr>
  )
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function buildItemsPdf(
  items: ItemSalesRow[],
  totals: { qty: number; net: number },
  formatCurrency: (n: number) => string,
): string {
  const body = items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.category ?? '—')}</td><td class="num">${i.qty_sold}</td><td class="num">${escapeHtml(formatCurrency(i.gross))}</td><td class="num">${escapeHtml(formatCurrency(i.net))}</td><td class="num">${i.percent_of_net.toFixed(1)}%</td><td class="num">${i.orders_count}</td></tr>`,
    )
    .join('')
  return `
    <table>
      <thead><tr><th>Item</th><th>Category</th><th class="num">Qty</th><th class="num">Gross</th><th class="num">Net</th><th class="num">% of net</th><th class="num">Orders</th></tr></thead>
      <tbody>${body || `<tr><td colspan="7" class="muted">No items</td></tr>`}</tbody>
      <tfoot><tr><th colspan="2">Total</th><th class="num">${totals.qty}</th><th></th><th class="num">${escapeHtml(formatCurrency(totals.net))}</th><th></th><th></th></tr></tfoot>
    </table>
  `
}
