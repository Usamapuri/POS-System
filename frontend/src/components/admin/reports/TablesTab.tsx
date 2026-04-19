import { useMemo } from 'react'
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
import { MapPin, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import apiClient from '@/api/client'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { UseReportRange } from '@/hooks/useReportRange'
import type { PartySizeRow, TableSalesRow } from '@/types'
import { ExportButton } from './ExportButton'
import { ReportsExportSlot } from './ReportsExportSlot'
import { openPrintableReport, escapeHtml } from '@/lib/printReport'
import { formatDateDDMMYYYY } from '@/lib/utils'

interface Props {
  range: UseReportRange
}

export function TablesTab({ range }: Props) {
  const { formatCurrency } = useCurrency()

  const tablesQuery = useQuery({
    queryKey: ['reports-v2', 'tables', range.fromISO, range.toISO],
    queryFn: () => apiClient.getTableSalesReport(range.fromISO, range.toISO),
    staleTime: 30_000,
  })
  const partyQuery = useQuery({
    queryKey: ['reports-v2', 'party-size', range.fromISO, range.toISO],
    queryFn: () => apiClient.getPartySizeReport(range.fromISO, range.toISO),
    staleTime: 30_000,
  })

  const tables = tablesQuery.data?.data ?? []
  const partySize = partyQuery.data?.data ?? []

  const top = useMemo(() => tables.slice(0, 10), [tables])
  const totals = useMemo(
    () =>
      tables.reduce(
        (acc, r) => ({
          parties: acc.parties + r.parties,
          covers: acc.covers + r.covers,
          net: acc.net + r.net_sales,
        }),
        { parties: 0, covers: 0, net: 0 },
      ),
    [tables],
  )

  const handlePrintTablesPdf = () => {
    openPrintableReport({
      title: 'Tables & Parties',
      subtitle: `${formatDateDDMMYYYY(range.from)} → ${formatDateDDMMYYYY(range.to)} • Asia/Karachi`,
      bodyHtml: buildTablesPdf(tables, partySize, formatCurrency),
    })
  }

  return (
    <div className="space-y-4">
      <ReportsExportSlot>
        <ExportButton
          report="tables"
          reportLabel="Tables"
          fromISO={range.fromISO}
          toISO={range.toISO}
          onPrintPdf={handlePrintTablesPdf}
        />
        <ExportButton
          report="party_size"
          reportLabel="Party size"
          fromISO={range.fromISO}
          toISO={range.toISO}
        />
      </ReportsExportSlot>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Busiest tables</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          {tablesQuery.isLoading ? (
            <Skeleton className="w-full h-full" />
          ) : top.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No table sales in this range
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" margin={{ top: 8, right: 24, left: 16, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.18)" horizontal={false} />
                <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatCompact} />
                <YAxis dataKey="table_number" type="category" fontSize={11} tickLine={false} axisLine={false} width={140} />
                <ReTooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [formatCurrency(v), 'Net sales']}
                />
                <Bar dataKey="net_sales" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>Per-table summary ({tables.length})</span>
            {totals.parties > 0 && (
              <Badge variant="outline" className="text-xs">
                Total parties: {totals.parties.toLocaleString('en-US')} • Covers: {totals.covers.toLocaleString('en-US')} • Net: {formatCurrency(totals.net)}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tablesQuery.isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : tables.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No table sales in this range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5">Table</th>
                    <th className="text-left px-4 py-2.5">Location</th>
                    <th className="text-right px-4 py-2.5">Seats</th>
                    <th className="text-right px-4 py-2.5">Parties</th>
                    <th className="text-right px-4 py-2.5">Covers</th>
                    <th className="text-right px-4 py-2.5">Avg party</th>
                    <th className="text-right px-4 py-2.5">Avg check</th>
                    <th className="text-right px-4 py-2.5">Net sales</th>
                    <th className="text-right px-4 py-2.5">Net / cover</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tables.map((row) => (
                    <TableRow key={(row.table_id ?? '') + row.table_number} row={row} formatCurrency={formatCurrency} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Party size breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {partyQuery.isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : partySize.every((p) => p.parties === 0) ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No dine-in parties in this range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5">Party size</th>
                    <th className="text-right px-4 py-2.5">Parties</th>
                    <th className="text-right px-4 py-2.5">Covers</th>
                    <th className="text-right px-4 py-2.5">Net sales</th>
                    <th className="text-right px-4 py-2.5">Avg check</th>
                    <th className="text-right px-4 py-2.5">Net / cover</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {partySize.map((row) => (
                    <PartyRow key={row.bucket} row={row} formatCurrency={formatCurrency} />
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

function TableRow({ row, formatCurrency }: { row: TableSalesRow; formatCurrency: (n: number) => string }) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="px-4 py-3 font-medium">{row.table_number}</td>
      <td className="px-4 py-3 text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {row.location ? <MapPin className="w-3 h-3" /> : null}
          {[row.location, row.zone].filter(Boolean).join(' • ') || '—'}
        </span>
      </td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">
        {row.seating_capacity ? row.seating_capacity : '—'}
      </td>
      <td className="text-right tabular-nums px-4 py-3">{row.parties.toLocaleString('en-US')}</td>
      <td className="text-right tabular-nums px-4 py-3">{row.covers.toLocaleString('en-US')}</td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">
        {row.parties > 0 ? row.avg_covers_per_party.toFixed(1) : '—'}
      </td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">
        {row.parties > 0 ? formatCurrency(row.avg_check) : '—'}
      </td>
      <td className="text-right tabular-nums px-4 py-3 font-semibold">{formatCurrency(row.net_sales)}</td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">
        {row.covers > 0 ? formatCurrency(row.revenue_per_cover) : '—'}
      </td>
    </tr>
  )
}

function PartyRow({ row, formatCurrency }: { row: PartySizeRow; formatCurrency: (n: number) => string }) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="px-4 py-3 font-medium">{row.bucket}</td>
      <td className="text-right tabular-nums px-4 py-3">{row.parties.toLocaleString('en-US')}</td>
      <td className="text-right tabular-nums px-4 py-3">{row.covers.toLocaleString('en-US')}</td>
      <td className="text-right tabular-nums px-4 py-3 font-semibold">{formatCurrency(row.net_sales)}</td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">
        {row.parties > 0 ? formatCurrency(row.avg_check) : '—'}
      </td>
      <td className="text-right tabular-nums px-4 py-3 text-muted-foreground">
        {row.covers > 0 ? formatCurrency(row.revenue_per_cover) : '—'}
      </td>
    </tr>
  )
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function buildTablesPdf(
  tables: TableSalesRow[],
  partySize: PartySizeRow[],
  formatCurrency: (n: number) => string,
): string {
  const tableRows = tables
    .map(
      (t) =>
        `<tr><td>${escapeHtml(t.table_number)}</td><td>${escapeHtml([t.location, t.zone].filter(Boolean).join(' • ') || '—')}</td><td class="num">${t.seating_capacity ?? ''}</td><td class="num">${t.parties}</td><td class="num">${t.covers}</td><td class="num">${escapeHtml(formatCurrency(t.net_sales))}</td><td class="num">${t.parties > 0 ? escapeHtml(formatCurrency(t.avg_check)) : '—'}</td><td class="num">${t.covers > 0 ? escapeHtml(formatCurrency(t.revenue_per_cover)) : '—'}</td></tr>`,
    )
    .join('')
  const partyRows = partySize
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.bucket)}</td><td class="num">${p.parties}</td><td class="num">${p.covers}</td><td class="num">${escapeHtml(formatCurrency(p.net_sales))}</td><td class="num">${p.parties > 0 ? escapeHtml(formatCurrency(p.avg_check)) : '—'}</td><td class="num">${p.covers > 0 ? escapeHtml(formatCurrency(p.revenue_per_cover)) : '—'}</td></tr>`,
    )
    .join('')
  return `
    <section><div class="section-title">Per-table summary</div>
      <table>
        <thead><tr><th>Table</th><th>Location</th><th class="num">Seats</th><th class="num">Parties</th><th class="num">Covers</th><th class="num">Net</th><th class="num">Avg check</th><th class="num">Net/cover</th></tr></thead>
        <tbody>${tableRows || `<tr><td colspan="8" class="muted">No data</td></tr>`}</tbody>
      </table>
    </section>
    <section><div class="section-title">Party size breakdown</div>
      <table>
        <thead><tr><th>Party size</th><th class="num">Parties</th><th class="num">Covers</th><th class="num">Net</th><th class="num">Avg check</th><th class="num">Net/cover</th></tr></thead>
        <tbody>${partyRows || `<tr><td colspan="6" class="muted">No data</td></tr>`}</tbody>
      </table>
    </section>
  `
}
