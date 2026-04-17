import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format, subDays } from 'date-fns'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import type { Order } from '@/types'
import { cn } from '@/lib/utils'

type RangeKey = 'today' | 'yesterday' | 'week'

function orderHistoryFilters(
  orderType: 'dine_in' | 'takeout' | 'delivery',
  range: RangeKey
): { date_from: string; date_to: string; order_type: string; per_page: number } {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  if (range === 'today') {
    return { date_from: todayStr, date_to: todayStr, order_type: orderType, per_page: 50 }
  }
  if (range === 'yesterday') {
    const y = format(subDays(today, 1), 'yyyy-MM-dd')
    return { date_from: y, date_to: y, order_type: orderType, per_page: 50 }
  }
  const from = format(subDays(today, 6), 'yyyy-MM-dd')
  return { date_from: from, date_to: todayStr, order_type: orderType, per_page: 80 }
}

type Props = {
  orderType: 'dine_in' | 'takeout' | 'delivery'
  formatCurrency: (n: number) => string
  onSelectOrder: (order: Order) => void
}

export function CounterOrderHistorySection({ orderType, formatCurrency, onSelectOrder }: Props) {
  const [range, setRange] = useState<RangeKey>('today')
  const filters = useMemo(() => orderHistoryFilters(orderType, range), [orderType, range])

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['counterOrderHistory', filters],
    queryFn: async () => {
      const res = await apiClient.getOrders(filters)
      if (res.success === false && !Array.isArray(res.data)) {
        throw new Error(res.message || 'Failed to load orders')
      }
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const rows = data ?? []

  return (
    <details className="group rounded-lg border border-border/70 bg-muted/15 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground outline-none ring-offset-background hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
        <span>
          Order history <span className="font-normal text-muted-foreground">(this terminal)</span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-2 border-t border-border/60 px-3 pb-3 pt-2">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Browse past tickets for the current mode. Open a row to load that order on the counter (if still open) or
          view details.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['week', '7 days'],
            ] as const
          ).map(([k, label]) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={range === k ? 'default' : 'outline'}
              className="h-8 rounded-md px-2.5 text-xs"
              onClick={() => setRange(k)}
            >
              {label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => void refetch()}
          >
            Refresh
          </Button>
        </div>
        <div className="max-h-52 overflow-y-auto rounded-md border border-border/60 bg-background/80">
          {isFetching && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</div>
          )}
          {isError && (
            <div className="px-3 py-4 text-center text-xs text-destructive">Could not load orders.</div>
          )}
          {!isFetching && !isError && rows.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">No orders in this range.</div>
          )}
          {!isFetching &&
            rows.map((o) => (
              <button
                key={o.id}
                type="button"
                className={cn(
                  'flex w-full flex-col gap-0.5 border-b border-border/50 px-3 py-2.5 text-left text-sm last:border-0',
                  'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none'
                )}
                onClick={() => onSelectOrder(o)}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold tabular-nums">#{o.order_number}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(o.created_at), 'MMM d · h:mm a')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">{o.status.replace('_', ' ')}</span>
                  <span className="tabular-nums text-foreground">{formatCurrency(o.total_amount)}</span>
                </div>
              </button>
            ))}
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          For aggregates and exports, open{' '}
          <Link
            to="/admin/reports"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Admin → Reports
          </Link>
          .
        </p>
      </div>
    </details>
  )
}
