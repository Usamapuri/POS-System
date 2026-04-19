import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Download,
  Filter,
  Loader2,
  Radio,
  WifiOff,
  X,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import type { Order, User, VoidLogEntry } from '@/types'
import { useCurrency } from '@/contexts/CurrencyContext'
import { formatDateTimeDDMMYYYY } from '@/lib/utils'
import { VOID_REASONS } from '@/lib/void-reasons'
import { useKitchenStream } from '@/lib/kitchenStream'
import { toastHelpers } from '@/lib/toast-helpers'

const NONE = '__all__'
const PER_PAGE_OPTIONS = [20, 50, 100]
const EXPORT_HARD_CAP = 5000

function csvEscape(value: string | number | undefined | null): string {
  const s = value === undefined || value === null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadBlob(rows: string[], filename: string): void {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const CSV_HEADER = [
  'created_at',
  'order_number',
  'item_name',
  'quantity',
  'unit_price',
  'value',
  'reason',
  'voided_by',
  'authorized_by',
]

function entryToCsvRow(e: VoidLogEntry): string {
  return [
    csvEscape(e.created_at),
    csvEscape(e.order_number ?? ''),
    csvEscape(e.item_name),
    csvEscape(e.quantity),
    csvEscape(e.unit_price),
    csvEscape(e.unit_price * e.quantity),
    csvEscape(e.reason ?? ''),
    csvEscape(e.voided_by_name ?? ''),
    csvEscape(e.authorized_name ?? ''),
  ].join(',')
}

/**
 * Severity bucket scaled relative to the values currently visible. Top 20% of
 * line values on the page are "high", next 30% are "medium", the rest are
 * "low". This avoids hard-coded currency thresholds that don't translate
 * across USD / INR / IDR.
 */
function buildSeverityFn(values: number[]): (v: number) => 'low' | 'medium' | 'high' {
  if (values.length === 0) return () => 'low'
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (q: number) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0
  const p50 = idx(0.5)
  const p80 = idx(0.8)
  return (v: number) => {
    if (v >= p80 && v > 0) return 'high'
    if (v >= p50 && v > 0) return 'medium'
    return 'low'
  }
}

export function VoidLog() {
  const { formatCurrency } = useCurrency()
  const queryClient = useQueryClient()

  // Pagination
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [pageInput, setPageInput] = useState('')

  // Filters
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [voidedBy, setVoidedBy] = useState<string>(NONE)
  const [authorizedBy, setAuthorizedBy] = useState<string>(NONE)
  const [reason, setReason] = useState<string>(NONE)
  const [orderNumber, setOrderNumber] = useState('')
  const [debouncedOrderNumber, setDebouncedOrderNumber] = useState('')
  const [minValue, setMinValue] = useState('')

  // Drill-down
  const [drillOrderId, setDrillOrderId] = useState<string | null>(null)

  // Export
  const [exporting, setExporting] = useState(false)

  // Debounce order number search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedOrderNumber(orderNumber.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [orderNumber])

  const minValueNumber = useMemo(() => {
    const n = parseFloat(minValue)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }, [minValue])

  const queryParams = useMemo(
    () => ({
      page,
      per_page: perPage,
      from: fromDate || undefined,
      to: toDate || undefined,
      voided_by: voidedBy === NONE ? undefined : voidedBy,
      authorized_by: authorizedBy === NONE ? undefined : authorizedBy,
      reason: reason === NONE ? undefined : reason,
      order_number: debouncedOrderNumber || undefined,
      min_value: minValueNumber,
    }),
    [page, perPage, fromDate, toDate, voidedBy, authorizedBy, reason, debouncedOrderNumber, minValueNumber],
  )

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['void-log', queryParams],
    queryFn: () => apiClient.getVoidLog(queryParams),
  })

  // Staff lookup for filter dropdowns. Cached separately, not refetched on filter change.
  const { data: staffData } = useQuery({
    queryKey: ['void-log:staff'],
    queryFn: () => apiClient.getUsers({ per_page: 100 }),
    staleTime: 5 * 60 * 1000,
  })
  const staffList: User[] = useMemo(() => {
    const raw = staffData?.data as unknown
    if (Array.isArray(raw)) return raw as User[]
    if (raw && typeof raw === 'object' && Array.isArray((raw as any).data)) {
      return (raw as any).data as User[]
    }
    return []
  }, [staffData])

  const voiders = useMemo(
    () => staffList.filter((u) => u.is_active && ['server', 'counter', 'manager', 'admin'].includes(u.role)),
    [staffList],
  )
  const authorizers = useMemo(
    () => staffList.filter((u) => u.is_active && ['manager', 'admin'].includes(u.role)),
    [staffList],
  )

  const entries = (data?.data as VoidLogEntry[] | null) || []
  const meta = data?.meta || { current_page: 1, total_pages: 1, total: 0, per_page: perPage }

  // Live updates — the kitchen SSE stream already emits a "voided" event
  // whenever an item is voided. We invalidate so the table reflects new rows
  // without a manual refresh.
  const streamStatus = useKitchenStream({
    enabled: true,
    onEvent: (ev) => {
      if (ev.type === 'voided') {
        queryClient.invalidateQueries({ queryKey: ['void-log'] })
      }
    },
  })

  const severityFn = useMemo(
    () => buildSeverityFn(entries.map((e) => e.unit_price * e.quantity)),
    [entries],
  )

  const hasActiveFilters =
    !!fromDate ||
    !!toDate ||
    voidedBy !== NONE ||
    authorizedBy !== NONE ||
    reason !== NONE ||
    !!orderNumber ||
    !!minValueNumber

  const clearAllFilters = () => {
    setFromDate('')
    setToDate('')
    setVoidedBy(NONE)
    setAuthorizedBy(NONE)
    setReason(NONE)
    setOrderNumber('')
    setMinValue('')
    setPage(1)
  }

  // Reset to page 1 on any non-debounced filter change
  const onFilterChange = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }

  // Order drill-down query — only fires when a row is clicked.
  const { data: drillOrder, isLoading: drillLoading } = useQuery({
    queryKey: ['void-log:order', drillOrderId],
    queryFn: () => apiClient.getOrder(drillOrderId!),
    enabled: !!drillOrderId,
  })
  const orderDetail: Order | undefined = drillOrder?.data

  // Pull every void on this order so the side panel shows the full void
  // history, not just the row that was clicked.
  const { data: drillVoids } = useQuery({
    queryKey: ['void-log:order-voids', drillOrderId],
    queryFn: () =>
      apiClient.getVoidLog({
        per_page: 100,
        order_number: orderDetail?.order_number,
      }),
    enabled: !!drillOrderId && !!orderDetail?.order_number,
  })
  const orderVoids = useMemo(() => {
    const list = (drillVoids?.data as VoidLogEntry[] | null) || []
    return list.filter((v) => v.order_id === drillOrderId)
  }, [drillVoids, drillOrderId])

  // CSV exports ------------------------------------------------------------
  const exportCurrentPage = () => {
    if (entries.length === 0) {
      toastHelpers.warning('Nothing to export', 'There are no rows on this page.')
      return
    }
    const lines = [CSV_HEADER.join(','), ...entries.map(entryToCsvRow)]
    downloadBlob(
      lines,
      `void-log-page-${meta.current_page}-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const exportAllFiltered = async () => {
    if (meta.total === 0) {
      toastHelpers.warning('Nothing to export', 'No rows match the current filters.')
      return
    }
    if (meta.total > EXPORT_HARD_CAP) {
      toastHelpers.warning(
        'Too many rows',
        `Refine filters — exports are capped at ${EXPORT_HARD_CAP.toLocaleString()} rows.`,
      )
      return
    }
    setExporting(true)
    try {
      // Backend caps per_page at 100 (anything higher silently falls back to
      // the 20 default). Use the maximum to minimize roundtrips.
      const pageSize = 100
      const totalPages = Math.ceil(meta.total / pageSize)
      const all: VoidLogEntry[] = []
      for (let p = 1; p <= totalPages; p++) {
        const res = await apiClient.getVoidLog({ ...queryParams, page: p, per_page: pageSize })
        const rows = (res.data as VoidLogEntry[] | null) || []
        all.push(...rows)
        if (rows.length === 0) break
      }
      const lines = [CSV_HEADER.join(','), ...all.map(entryToCsvRow)]
      const fromTag = fromDate || 'all'
      const toTag = toDate || new Date().toISOString().slice(0, 10)
      downloadBlob(lines, `void-log-${fromTag}-to-${toTag}.csv`)
      toastHelpers.success('Export ready', `${all.length.toLocaleString()} rows exported.`)
    } catch (err) {
      toastHelpers.apiError('Export void log', err as Error)
    } finally {
      setExporting(false)
    }
  }

  // ---- Render ------------------------------------------------------------
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Void Log</h2>
          <p className="text-muted-foreground mt-1">
            Audit trail of all kitchen-fired items voided with manager authorization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveStatusPill status={streamStatus} />
          <Button
            variant="outline"
            size="sm"
            onClick={exportCurrentPage}
            disabled={entries.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export page
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportAllFiltered}
            disabled={exporting || meta.total === 0}
            title={
              meta.total > EXPORT_HARD_CAP
                ? `Refine filters — exports are capped at ${EXPORT_HARD_CAP.toLocaleString()} rows.`
                : undefined
            }
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export all filtered
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4 text-sm font-medium text-gray-700">
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-xs"
                onClick={clearAllFilters}
              >
                <X className="w-3 h-3 mr-1" /> Clear all
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FilterField label="From date">
              <DatePicker
                value={fromDate}
                onChange={onFilterChange(setFromDate)}
                max={toDate || undefined}
              />
            </FilterField>
            <FilterField label="To date">
              <DatePicker
                value={toDate}
                onChange={onFilterChange(setToDate)}
                min={fromDate || undefined}
              />
            </FilterField>
            <FilterField label="Voided by">
              <Select value={voidedBy} onValueChange={onFilterChange(setVoidedBy)}>
                <SelectTrigger>
                  <SelectValue placeholder="Anyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Anyone</SelectItem>
                  {voiders.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name} {u.last_name}
                      <span className="text-muted-foreground ml-1 text-xs">({u.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Authorized by">
              <Select value={authorizedBy} onValueChange={onFilterChange(setAuthorizedBy)}>
                <SelectTrigger>
                  <SelectValue placeholder="Any manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Any manager</SelectItem>
                  {authorizers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name} {u.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Reason">
              <Select value={reason} onValueChange={onFilterChange(setReason)}>
                <SelectTrigger>
                  <SelectValue placeholder="Any reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Any reason</SelectItem>
                  {VOID_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Order #">
              <Input
                placeholder="e.g. ORD-1024"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
              />
            </FilterField>
            <FilterField label="Min value">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0"
                value={minValue}
                onChange={(e) => onFilterChange(setMinValue)(e.target.value)}
              />
            </FilterField>
            <div className="flex items-end justify-end text-sm text-muted-foreground">
              <span>
                {isFetching ? 'Updating…' : `${meta.total.toLocaleString()} record${meta.total === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 sticky top-0 z-10">
                  <th className="text-left p-3 font-medium text-gray-600">Date/Time</th>
                  <th className="text-left p-3 font-medium text-gray-600">Order</th>
                  <th className="text-left p-3 font-medium text-gray-600">Item</th>
                  <th className="text-right p-3 font-medium text-gray-600">Qty</th>
                  <th className="text-right p-3 font-medium text-gray-600">Value</th>
                  <th className="text-left p-3 font-medium text-gray-600">Reason</th>
                  <th className="text-left p-3 font-medium text-gray-600">Voided by</th>
                  <th className="text-left p-3 font-medium text-gray-600">Authorized by</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-400">
                      <Loader2 className="w-5 h-5 inline animate-spin mr-2" />
                      Loading void log…
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center">
                      <div className="text-red-600 font-medium">Failed to load void log</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {(error as Error)?.message || 'Unexpected error'}
                      </div>
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>
                        Retry
                      </Button>
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <EmptyState hasActiveFilters={hasActiveFilters} onClear={clearAllFilters} />
                ) : (
                  entries.map((entry, idx) => {
                    const value = entry.unit_price * entry.quantity
                    const sev = severityFn(value)
                    return (
                      <tr
                        key={entry.id}
                        className={`border-b hover:bg-blue-50/40 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                      >
                        <td className="p-3 text-gray-500 whitespace-nowrap">
                          <Calendar className="w-3 h-3 inline mr-1 text-gray-400" />
                          {formatDateTimeDDMMYYYY(entry.created_at)}
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {entry.order_id && entry.order_number ? (
                            <button
                              type="button"
                              onClick={() => setDrillOrderId(entry.order_id!)}
                              className="text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-300 rounded"
                            >
                              {entry.order_number}
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3 font-medium text-gray-900">{entry.item_name}</td>
                        <td className="p-3 text-right tabular-nums">{entry.quantity}</td>
                        <td className="p-3 text-right tabular-nums">
                          <span
                            className={
                              sev === 'high'
                                ? 'font-semibold text-red-600'
                                : sev === 'medium'
                                  ? 'font-semibold text-yellow-600'
                                  : 'text-gray-700'
                            }
                            title={
                              sev === 'high'
                                ? 'High impact — top 20% of voids on this page'
                                : sev === 'medium'
                                  ? 'Medium impact — above-median void on this page'
                                  : undefined
                            }
                          >
                            {formatCurrency(value)}
                          </span>
                        </td>
                        <td className="p-3">
                          {entry.reason ? (
                            <Badge variant="outline" className="text-xs">
                              {entry.reason}
                            </Badge>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-gray-600">{entry.voided_by_name || '—'}</td>
                        <td className="p-3 text-gray-600">{entry.authorized_name || '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {(meta.total_pages > 1 || entries.length > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t mt-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Rows per page</span>
                <Select
                  value={String(perPage)}
                  onValueChange={(v) => {
                    setPerPage(Number(v))
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="h-8 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PER_PAGE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  aria-label="First page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-gray-600 px-1">
                  Page <strong>{meta.current_page}</strong> of {meta.total_pages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.total_pages}
                  onClick={() => setPage(meta.total_pages)}
                  aria-label="Last page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
                <form
                  className="flex items-center gap-1 ml-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const n = parseInt(pageInput, 10)
                    if (Number.isFinite(n) && n >= 1 && n <= meta.total_pages) {
                      setPage(n)
                      setPageInput('')
                    }
                  }}
                >
                  <span className="text-gray-600">Go to</span>
                  <Input
                    type="number"
                    min={1}
                    max={meta.total_pages}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    className="h-8 w-16"
                    placeholder={String(meta.current_page)}
                  />
                </form>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drill-down dialog */}
      <Dialog open={!!drillOrderId} onOpenChange={(open) => !open && setDrillOrderId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Order {orderDetail?.order_number ?? '…'}
            </DialogTitle>
            <DialogDescription>
              Full order detail and complete void history for this order.
            </DialogDescription>
          </DialogHeader>
          {drillLoading || !orderDetail ? (
            <div className="py-10 text-center text-gray-500">
              <Loader2 className="w-6 h-6 inline animate-spin" />
            </div>
          ) : (
            <OrderDrillDown order={orderDetail} voids={orderVoids} formatCurrency={formatCurrency} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-700 block mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}

function LiveStatusPill({ status }: { status: 'connecting' | 'live' | 'offline' }) {
  if (status === 'live') {
    return (
      <Badge variant="outline" className="gap-1.5 border-green-300 bg-green-50 text-green-700">
        <Radio className="w-3 h-3 animate-pulse" />
        Live
      </Badge>
    )
  }
  if (status === 'connecting') {
    return (
      <Badge variant="outline" className="gap-1.5 border-amber-300 bg-amber-50 text-amber-700">
        <Loader2 className="w-3 h-3 animate-spin" />
        Connecting
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1.5 border-gray-300 bg-gray-50 text-gray-600">
      <WifiOff className="w-3 h-3" />
      Offline
    </Badge>
  )
}

function EmptyState({
  hasActiveFilters,
  onClear,
}: {
  hasActiveFilters: boolean
  onClear: () => void
}) {
  return (
    <tr>
      <td colSpan={8} className="p-10">
        <div className="max-w-md mx-auto text-center">
          <div className="text-gray-700 font-medium">
            {hasActiveFilters ? 'No voids match your filters' : 'No voids recorded yet'}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {hasActiveFilters ? (
              <>Try widening the date range or clearing some filters.</>
            ) : (
              <>
                Voids appear here only after an item has been sent to the kitchen and a manager
                authorizes the void with their PIN. Draft items removed before being fired are not
                tracked here.
              </>
            )}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
              Clear all filters
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

function OrderDrillDown({
  order,
  voids,
  formatCurrency,
}: {
  order: Order
  voids: VoidLogEntry[]
  formatCurrency: (n: number) => string
}) {
  const items = order.items || []
  const liveItems = items.filter((i) => i.status !== 'voided')
  const voidedItems = items.filter((i) => i.status === 'voided')
  const voidedTotal = voids.reduce((sum, v) => sum + v.unit_price * v.quantity, 0)

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      {/* Order summary */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <SummaryRow label="Type" value={order.order_type.replace('_', '-')} />
        <SummaryRow label="Status" value={order.status} />
        <SummaryRow label="Server" value={order.user ? `${order.user.first_name} ${order.user.last_name}` : '—'} />
        <SummaryRow label="Table" value={order.table?.table_number ?? '—'} />
        <SummaryRow label="Created" value={formatDateTimeDDMMYYYY(order.created_at)} />
        <SummaryRow label="Total" value={formatCurrency(order.total_amount)} />
      </div>

      {/* Voids on this order */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-gray-900">
            Voids on this order ({voids.length})
          </h4>
          <span className="text-sm text-red-600 font-semibold">
            −{formatCurrency(voidedTotal)}
          </span>
        </div>
        {voids.length === 0 ? (
          <p className="text-sm text-gray-500">No voids recorded for this order.</p>
        ) : (
          <ul className="divide-y border rounded-md">
            {voids.map((v) => (
              <li key={v.id} className="p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">
                      {v.item_name} <span className="text-gray-500">× {v.quantity}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatDateTimeDDMMYYYY(v.created_at)}
                      {v.reason ? ` · ${v.reason}` : ''}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Voided by {v.voided_by_name || '—'}
                      {v.authorized_name ? ` · authorized by ${v.authorized_name}` : ''}
                    </div>
                  </div>
                  <div className="text-right tabular-nums font-semibold text-red-600">
                    −{formatCurrency(v.unit_price * v.quantity)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* All items on the order, with their current status */}
      <section>
        <h4 className="font-semibold text-gray-900 mb-2">
          All items ({items.length})
        </h4>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No item data available.</p>
        ) : (
          <ul className="divide-y border rounded-md">
            {[...liveItems, ...voidedItems].map((it) => (
              <li
                key={it.id}
                className={`p-3 text-sm flex justify-between gap-3 ${
                  it.status === 'voided' ? 'bg-red-50/40' : ''
                }`}
              >
                <div>
                  <div className="font-medium text-gray-900">
                    {it.product?.name ?? 'Item'} <span className="text-gray-500">× {it.quantity}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 capitalize">{it.status}</div>
                </div>
                <div
                  className={`text-right tabular-nums ${
                    it.status === 'voided' ? 'text-red-600 line-through' : 'text-gray-700'
                  }`}
                >
                  {formatCurrency(it.total_price)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between border-b py-1.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900 capitalize">{value}</span>
    </div>
  )
}
