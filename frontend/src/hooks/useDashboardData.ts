import { useRef, useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import {
  useDashboardStream,
  type DashboardStreamEvent,
  type DashboardStreamStatus,
} from '@/lib/dashboardStream'
import type {
  DashboardActivityEntry,
  DashboardAlert,
  DashboardOverview,
  DashboardPeriod,
  DashboardTopItem,
  LivePulse,
  OrderTypeMixSlice,
  PaymentMixSlice,
  SalesTimeseries,
} from '@/types'

// ────────────────────────────────────────────────────────────────────────────
// useDashboardData — single hook that returns everything the redesigned
// admin dashboard needs.
//
// Design goals:
//   - One place to tune React Query options per section. The financial side
//     refetches on focus only (cheap); the live side polls every 15s as a
//     safety net under the SSE stream.
//   - SSE events trigger immediate cache invalidation for `live` and append
//     to a bounded in-memory activity feed. Authoritative numbers are still
//     fetched over REST so the client never has to interpret aggregates.
// ────────────────────────────────────────────────────────────────────────────

const ACTIVITY_BUFFER_LIMIT = 50

interface UseDashboardDataOpts {
  period: DashboardPeriod
  /** ISO YYYY-MM-DD when period === 'custom'. */
  from?: string
  to?: string
}

export interface UseDashboardDataResult {
  overview: ReturnType<typeof useQuery<DashboardOverview | undefined>>
  live: ReturnType<typeof useQuery<LivePulse | undefined>>
  timeseries: ReturnType<typeof useQuery<SalesTimeseries | undefined>>
  topItems: ReturnType<typeof useQuery<DashboardTopItem[] | undefined>>
  paymentMix: ReturnType<typeof useQuery<PaymentMixSlice[] | undefined>>
  orderTypeMix: ReturnType<typeof useQuery<OrderTypeMixSlice[] | undefined>>
  alerts: ReturnType<typeof useQuery<DashboardAlert[] | undefined>>
  activity: DashboardActivityEntry[]
  streamStatus: DashboardStreamStatus
  refetchAll: () => void
}

export function useDashboardData({ period, from, to }: UseDashboardDataOpts): UseDashboardDataResult {
  const queryClient = useQueryClient()
  const periodKey = useMemo(() => [period, from ?? '', to ?? ''] as const, [period, from, to])

  // ─── Data fetchers ────────────────────────────────────────────────────
  const overview = useQuery<DashboardOverview | undefined>({
    queryKey: ['dashboard', 'overview', ...periodKey],
    queryFn: () => apiClient.getDashboardOverview(period, from, to).then((r) => r.data),
    staleTime: 60_000,
  })

  const live = useQuery<LivePulse | undefined>({
    queryKey: ['dashboard', 'live'],
    queryFn: () => apiClient.getDashboardLive().then((r) => r.data),
    staleTime: 5_000,
    // Polling is a safety net beneath the SSE stream — if the stream drops
    // we still see updates within 15s.
    refetchInterval: 15_000,
  })

  const timeseries = useQuery<SalesTimeseries | undefined>({
    queryKey: ['dashboard', 'timeseries', ...periodKey],
    queryFn: () => apiClient.getDashboardSalesTimeseries(period, from, to).then((r) => r.data),
    staleTime: 60_000,
  })

  const topItems = useQuery<DashboardTopItem[] | undefined>({
    queryKey: ['dashboard', 'top-items', ...periodKey],
    queryFn: () => apiClient.getDashboardTopItems(period, { from, to, limit: 5 }).then((r) => r.data),
    staleTime: 60_000,
  })

  const paymentMix = useQuery<PaymentMixSlice[] | undefined>({
    queryKey: ['dashboard', 'payment-mix', ...periodKey],
    queryFn: () => apiClient.getDashboardPaymentMix(period, from, to).then((r) => r.data),
    staleTime: 60_000,
  })

  const orderTypeMix = useQuery<OrderTypeMixSlice[] | undefined>({
    queryKey: ['dashboard', 'order-type-mix', ...periodKey],
    queryFn: () => apiClient.getDashboardOrderTypeMix(period, from, to).then((r) => r.data),
    staleTime: 60_000,
  })

  const alerts = useQuery<DashboardAlert[] | undefined>({
    queryKey: ['dashboard', 'alerts'],
    queryFn: () => apiClient.getDashboardAlerts().then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }, [queryClient])

  // ─── Activity buffer + SSE handler ───────────────────────────────────
  const [activity, setActivity] = useState<DashboardActivityEntry[]>([])
  const seenIds = useRef<Set<string>>(new Set())

  const handleEvent = useCallback(
    (ev: DashboardStreamEvent) => {
      // Always invalidate live + alerts on any event — those are the cheap
      // queries that should reflect the new state.
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'live'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'alerts'] })

      // The financial queries are scoped to a period — only invalidate when
      // the active period actually contains "now". Custom windows in the past
      // shouldn't refetch on every order. yesterday / day-before are also
      // immutable from the dashboard's perspective.
      if (periodIncludesNow(period)) {
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview', ...periodKey] })
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'timeseries', ...periodKey] })
        if (ev.type === 'payment' || ev.type === 'order_completed') {
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'top-items', ...periodKey] })
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'payment-mix', ...periodKey] })
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'order-type-mix', ...periodKey] })
        }
      }

      // Append to the activity feed (deduped, bounded).
      const id = `${ev.emitted_at ?? Date.now()}-${ev.order_id ?? ''}-${ev.type}`
      if (seenIds.current.has(id)) return
      seenIds.current.add(id)

      const entry: DashboardActivityEntry = {
        id,
        type: ev.type as DashboardActivityEntry['type'],
        title: ev.title || titleForEventType(ev.type),
        detail: ev.detail || '',
        amount: ev.amount,
        order_id: ev.order_id,
        order_number: ev.order_number,
        at: ev.emitted_at ?? new Date().toISOString(),
      }
      setActivity((prev) => {
        const next = [entry, ...prev]
        if (next.length > ACTIVITY_BUFFER_LIMIT) {
          // Trim and prune seenIds so the set doesn't grow unbounded.
          const dropped = next.slice(ACTIVITY_BUFFER_LIMIT)
          dropped.forEach((d) => seenIds.current.delete(d.id))
          return next.slice(0, ACTIVITY_BUFFER_LIMIT)
        }
        return next
      })
    },
    [queryClient, period, periodKey],
  )

  const streamStatus = useDashboardStream({ onEvent: handleEvent })

  return {
    overview,
    live,
    timeseries,
    topItems,
    paymentMix,
    orderTypeMix,
    alerts,
    activity,
    streamStatus,
    refetchAll,
  }
}

// Periods whose `to` boundary is "today, business-tz" — these benefit from
// cache invalidation on every dashboard event because new activity actually
// changes the totals. yesterday / custom windows in the past don't.
function periodIncludesNow(period: DashboardPeriod): boolean {
  return period === 'today' || period === '7d' || period === '30d' || period === 'cw' || period === 'cm'
}

function titleForEventType(t: string): string {
  switch (t) {
    case 'order_created':
      return 'New order'
    case 'order_updated':
      return 'Order updated'
    case 'order_completed':
      return 'Order completed'
    case 'order_cancelled':
      return 'Order cancelled'
    case 'order_voided':
      return 'Item voided'
    case 'payment':
      return 'Payment received'
    case 'table_changed':
      return 'Table state changed'
    default:
      return t
  }
}
