import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Clock,
  Loader2,
  Printer,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import apiClient from '@/api/client'
import { useToast } from '@/hooks/use-toast'
import { useCurrency } from '@/contexts/CurrencyContext'
import {
  formatDateDDMMYYYY,
  formatDateTimeDDMMYYYY,
  toIsoDate,
  cn,
} from '@/lib/utils'
import { printPraTaxInvoice } from '@/lib/printPraTaxInvoice'
import {
  getCashierNameFromStorage,
  parseReceiptSettings,
} from '@/lib/printCustomerReceipt'
import type { OrdersBrowserRow } from '@/types'

type PraFilter = 'all' | 'printed' | 'not_printed' | 'eligible'

const PRA_FILTERS: { id: PraFilter; label: string; hint: string }[] = [
  { id: 'all', label: 'All orders', hint: 'Every order on this day' },
  { id: 'not_printed', label: 'Not printed', hint: 'PRA invoice was never printed for these' },
  { id: 'printed', label: 'Printed', hint: 'A PRA invoice was already issued' },
  { id: 'eligible', label: 'Eligible to print', hint: 'You can issue / reissue a PRA invoice now' },
]

interface Props {
  /**
   * The day to render orders for. Owned by `ReportsShell` so the picker
   * can live in the page header alongside the other tabs' date controls.
   */
  day: Date
}

export function OrdersBrowserTab({ day }: Props) {
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [praFilter, setPraFilter] = useState<PraFilter>('all')
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null)

  const dayISO = toIsoDate(day)

  const ordersQuery = useQuery({
    queryKey: ['reports-v2', 'orders-browser', dayISO, search.trim(), praFilter],
    queryFn: () => apiClient.getOrdersBrowser(dayISO, { search: search.trim() || undefined, pra_filter: praFilter }),
    staleTime: 15_000,
  })

  const data = ordersQuery.data?.data
  const orders = data?.orders ?? []
  const windowDays = data?.pra_window_days ?? 7

  const totals = useMemo(() => {
    return orders.reduce(
      (acc, o) => ({
        count: acc.count + 1,
        revenue: acc.revenue + (o.status === 'completed' ? o.total_amount : 0),
        printed: acc.printed + (o.pra_invoice_printed ? 1 : 0),
      }),
      { count: 0, revenue: 0, printed: 0 },
    )
  }, [orders])

  const printPra = useMutation({
    mutationFn: async (row: OrdersBrowserRow) => {
      // Always pull the full order (with items) before sending to the printer —
      // the OrdersBrowser row is intentionally lightweight.
      const [orderRes, settingsRes] = await Promise.all([
        apiClient.getOrder(row.id),
        queryClient.fetchQuery({
          queryKey: ['settings', 'all'],
          queryFn: () => apiClient.getAllSettings(),
        }),
      ])
      if (!orderRes.success || !orderRes.data) {
        throw new Error(orderRes.message || 'Failed to load order')
      }
      if (!settingsRes.success || !settingsRes.data) {
        throw new Error(settingsRes.message || 'Failed to load receipt settings')
      }

      const cfg = parseReceiptSettings(settingsRes.data as Record<string, unknown>)
      const order = orderRes.data
      const paidAt = order.completed_at ? new Date(order.completed_at) : new Date()
      const method =
        (order.checkout_payment_method as 'cash' | 'card' | 'online' | undefined) ?? 'cash'

      const { invoiceNumber, printed } = await printPraTaxInvoice(order, cfg, {
        cashierName: getCashierNameFromStorage(),
        paymentMethod: method,
        paidAt,
        formatAmount: formatCurrency,
      })

      if (!printed) {
        throw new Error('Print dialog was cancelled')
      }

      // Recording the print is best-effort; failures here will surface on the
      // next refresh as the order keeps its existing state.
      await apiClient.markPraInvoicePrinted(order.id, invoiceNumber || undefined)
    },
    onSuccess: () => {
      toast({ title: 'PRA invoice printed', description: 'Audit log updated.' })
      queryClient.invalidateQueries({ queryKey: ['reports-v2', 'orders-browser'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (error: unknown) => {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error)
      toast({
        title: 'Could not print PRA invoice',
        description: msg,
        variant: 'destructive',
      })
    },
    onSettled: () => setPrintingId(null),
  })

  const focusedOrder = useMemo(
    () => orders.find((o) => o.id === drawerOrderId) ?? null,
    [orders, drawerOrderId],
  )

  return (
    <div className="space-y-4">
      {/* Filter bar — date picker lives in the page header (see ReportsShell).
          This card is now focused on the per-day search and PRA filters. */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search order #, table, customer, server"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-1 rounded-md bg-muted p-1">
            {PRA_FILTERS.map((f) => (
              <TooltipProvider key={f.id} delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant={praFilter === f.id ? 'default' : 'ghost'}
                      className="h-7 px-3 text-xs"
                      onClick={() => setPraFilter(f.id)}
                    >
                      {f.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">{f.hint}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[11px]">
              Late-print window: {windowDays} day{windowDays === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Orders on {formatDateDDMMYYYY(day)} ({orders.length})
          </CardTitle>
          <div className="text-xs text-muted-foreground tabular-nums flex items-center gap-3">
            <span>Net revenue: <span className="font-semibold text-foreground">{formatCurrency(totals.revenue)}</span></span>
            <span>PRA printed: <span className="font-semibold text-foreground">{totals.printed}/{totals.count}</span></span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ordersQuery.isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : ordersQuery.isError ? (
            <div className="p-10 text-center text-sm text-destructive">
              Failed to load orders: {String((ordersQuery.error as Error)?.message ?? 'unknown')}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No orders match these filters for {formatDateDDMMYYYY(day)}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5">Order #</th>
                    <th className="text-left px-4 py-2.5">Time</th>
                    <th className="text-left px-4 py-2.5">Table</th>
                    <th className="text-left px-4 py-2.5">Server</th>
                    <th className="text-right px-4 py-2.5">Party</th>
                    <th className="text-right px-4 py-2.5">Total</th>
                    <th className="text-left px-4 py-2.5">Payment</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-left px-4 py-2.5">PRA</th>
                    <th className="text-right px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((row) => (
                    <OrdersRow
                      key={row.id}
                      row={row}
                      printing={printingId === row.id}
                      formatCurrency={formatCurrency}
                      onView={() => setDrawerOrderId(row.id)}
                      onPrint={() => {
                        setPrintingId(row.id)
                        printPra.mutate(row)
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {focusedOrder && (
        <OrderDrawer
          row={focusedOrder}
          formatCurrency={formatCurrency}
          onClose={() => setDrawerOrderId(null)}
          onPrint={() => {
            setPrintingId(focusedOrder.id)
            printPra.mutate(focusedOrder)
          }}
          printing={printingId === focusedOrder.id}
        />
      )}
    </div>
  )
}

function OrdersRow({
  row,
  printing,
  formatCurrency,
  onView,
  onPrint,
}: {
  row: OrdersBrowserRow
  printing: boolean
  formatCurrency: (n: number) => string
  onView: () => void
  onPrint: () => void
}) {
  const timePart = row.created_at_label.split(' ')[1] ?? row.created_at_label

  return (
    <tr className="hover:bg-muted/20">
      <td className="px-4 py-3 font-medium tabular-nums">{row.order_number}</td>
      <td className="px-4 py-3 text-muted-foreground tabular-nums">{timePart}</td>
      <td className="px-4 py-3">{row.table_number ?? '—'}</td>
      <td className="px-4 py-3 text-muted-foreground">{row.server_name ?? '—'}</td>
      <td className="text-right tabular-nums px-4 py-3">{row.guest_count > 0 ? row.guest_count : '—'}</td>
      <td className="text-right tabular-nums px-4 py-3 font-semibold">{formatCurrency(row.total_amount)}</td>
      <td className="px-4 py-3 text-muted-foreground capitalize">{row.checkout_payment_method ?? '—'}</td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-4 py-3">
        <PraStatusBadge row={row} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onView}>
            View
          </Button>
          <PrintPraButton row={row} printing={printing} onClick={onPrint} />
        </div>
      </td>
    </tr>
  )
}

function StatusBadge({ status }: { status: string }) {
  let cls = 'bg-muted text-muted-foreground'
  if (status === 'completed') cls = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
  else if (status === 'cancelled') cls = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
  else if (status === 'pending' || status === 'preparing') cls = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
  return <Badge variant="outline" className={cn('text-[10px] capitalize border-transparent', cls)}>{status}</Badge>
}

function PraStatusBadge({ row }: { row: OrdersBrowserRow }) {
  if (!row.pra_invoice_printed) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950 dark:text-amber-200">
        <XCircle className="w-3 h-3" /> Not printed
      </Badge>
    )
  }
  if (row.can_print_pra) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950 dark:text-emerald-200">
        <CheckCircle2 className="w-3 h-3" /> Printed
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-muted bg-muted text-muted-foreground">
      <Clock className="w-3 h-3" /> Window expired
    </Badge>
  )
}

function PrintPraButton({
  row,
  printing,
  onClick,
}: {
  row: OrdersBrowserRow
  printing: boolean
  onClick: () => void
}) {
  const Icon = row.pra_invoice_printed ? RotateCcw : Printer
  const label = row.pra_invoice_printed ? 'Reprint PRA' : 'Print PRA'
  const button = (
    <Button
      type="button"
      size="sm"
      variant={row.can_print_pra ? 'default' : 'outline'}
      disabled={!row.can_print_pra || printing}
      onClick={onClick}
      className="gap-1.5"
    >
      {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </Button>
  )

  if (row.can_print_pra) return button

  const reason = row.can_print_pra_reason ?? 'PRA reprint not available for this order.'
  const printedNote = row.pra_invoice_printed_at_label
    ? ` Originally printed ${row.pra_invoice_printed_at_label}.`
    : ''
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs text-xs">
          {reason}{printedNote}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function OrderDrawer({
  row,
  formatCurrency,
  onClose,
  onPrint,
  printing,
}: {
  row: OrdersBrowserRow
  formatCurrency: (n: number) => string
  onClose: () => void
  onPrint: () => void
  printing: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex justify-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="h-full w-full max-w-md bg-background shadow-xl border-l border-border overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Order detail</p>
            <h3 className="text-lg font-semibold tabular-nums">{row.order_number}</h3>
            <p className="text-xs text-muted-foreground">Created {row.created_at_label}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="p-5 space-y-4">
          <DetailRow label="Status">
            <StatusBadge status={row.status} />
          </DetailRow>
          <DetailRow label="Table">{row.table_number ?? '—'}</DetailRow>
          <DetailRow label="Server">{row.server_name ?? '—'}</DetailRow>
          <DetailRow label="Customer">{row.customer_name ?? '—'}</DetailRow>
          <DetailRow label="Party size">{row.guest_count > 0 ? row.guest_count : '—'}</DetailRow>
          <DetailRow label="Payment method">{row.checkout_payment_method ?? '—'}</DetailRow>
          <DetailRow label="Total">
            <span className="font-semibold">{formatCurrency(row.total_amount)}</span>
          </DetailRow>
          {row.completed_at_label && (
            <DetailRow label="Completed at">{row.completed_at_label}</DetailRow>
          )}

          <div className="rounded-md border p-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">PRA tax invoice</p>
            <DetailRow label="Status">
              <PraStatusBadge row={row} />
            </DetailRow>
            {row.pra_invoice_number && (
              <DetailRow label="Invoice #">{row.pra_invoice_number}</DetailRow>
            )}
            {row.pra_invoice_printed_at_label && (
              <DetailRow label="First printed">{row.pra_invoice_printed_at_label}</DetailRow>
            )}
            {row.pra_invoice_reprint_count > 0 && (
              <DetailRow label="Reprints">
                {row.pra_invoice_reprint_count}
                {row.pra_invoice_last_reprinted_by_name
                  ? ` (last by ${row.pra_invoice_last_reprinted_by_name})`
                  : ''}
                {row.pra_invoice_last_reprinted_at
                  ? ` on ${formatDateTimeDDMMYYYY(row.pra_invoice_last_reprinted_at)}`
                  : ''}
              </DetailRow>
            )}
            {row.pra_late_window_expires_at && (
              <DetailRow label="Eligible until">
                {formatDateTimeDDMMYYYY(row.pra_late_window_expires_at)}
              </DetailRow>
            )}
            <div className="pt-3">
              <PrintPraButton row={row} printing={printing} onClick={onPrint} />
              {!row.can_print_pra && row.can_print_pra_reason && (
                <p className="text-[11px] text-muted-foreground mt-2">{row.can_print_pra_reason}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{children}</span>
    </div>
  )
}

