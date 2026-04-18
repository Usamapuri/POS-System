import { useCallback, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  RefreshCw,
  Volume2,
  VolumeX,
  ChefHat,
  Package,
  AlertCircle,
  LogOut,
  Undo2,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  Home,
  ShoppingBag,
  Truck,
  Flame,
  Filter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import apiClient from '@/api/client'
import type { User as UserType, Order, KitchenStation } from '@/types'
import { KOTCard, displayTicketNo } from './KOTCard'
import { ConsolidatedPrepList } from './ConsolidatedPrepList'
import { publishOrderReady } from '@/lib/kdsRealtime'
import { useToast } from '@/hooks/use-toast'
import { useKitchenSettings } from '@/hooks/useKitchenSettings'
import { useKitchenStream } from '@/lib/kitchenStream'

interface NewEnhancedKitchenLayoutProps {
  user: UserType
}

type LiveFilter = 'all' | 'dine_in' | 'takeout' | 'delivery' | 'urgent'

interface RecentBumped {
  id: string
  order_number: string
  order_type: string
  customer_name?: string
  table_number?: string | null
  kitchen_bumped_at?: string | null
}

// Shared query key PREFIXES so SSE invalidations hit every variant (e.g.
// different station filters) with a single invalidate call.
const ACTIVE_ORDERS_KEY_PREFIX = ['newEnhancedKitchenOrders'] as const
const RECENT_BUMPED_KEY = ['kitchenRecentBumped'] as const
const TAKEAWAY_READY_KEY = ['kitchenTakeawayReady'] as const

export function NewEnhancedKitchenLayout({ user }: NewEnhancedKitchenLayoutProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const kitchen = useKitchenSettings()

  const [liveFilter, setLiveFilter] = useState<LiveFilter>('all')
  const [stationFilter, setStationFilter] = useState<string>('all')
  const [showSoundSettings, setShowSoundSettings] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [volume, setVolume] = useState(0.7)
  const [prepRailOpen, setPrepRailOpen] = useState(true)

  // ── Queries ──

  const {
    data: ordersResponse,
    isLoading,
    refetch,
    error,
    isFetching,
  } = useQuery({
    // stationFilter in the key means RQ transparently maintains one cache
    // per filter, so switching filters is instant once visited once.
    queryKey: [...ACTIVE_ORDERS_KEY_PREFIX, { stationFilter }] as const,
    queryFn: () => apiClient.getKitchenOrders(
      stationFilter !== 'all' ? { status: 'all', station_id: stationFilter } : 'all',
    ),
    // SSE drives the updates; polling is a fallback only (30s) in case the
    // stream drops and the browser doesn't reconnect immediately.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 2,
    select: (data) => data.data || [],
  })

  const { data: takeawayReady = [] } = useQuery({
    queryKey: TAKEAWAY_READY_KEY,
    queryFn: async () => {
      const res = await apiClient.getOrders({ status: 'ready', order_type: 'takeout', per_page: 50 })
      return res.data ?? []
    },
    refetchInterval: 30_000,
  })

  const { data: recentBumped = [] } = useQuery({
    queryKey: RECENT_BUMPED_KEY,
    queryFn: async () => {
      const res = await apiClient.getRecentBumpedOrders(5)
      return (res.data ?? []) as RecentBumped[]
    },
    refetchInterval: 20_000,
  })

  const { data: stationsRes } = useQuery({
    queryKey: ['kitchen', 'stations'],
    queryFn: () => apiClient.getKitchenStations(),
    staleTime: 60_000,
  })
  // Only KDS-output stations make sense as filters here — printer-only
  // stations never produce KDS items, so a chip for them would always
  // return an empty list and confuse the cooks.
  const stations = ((stationsRes?.data ?? []) as KitchenStation[])
    .filter((s) => s.is_active && s.output_type !== 'printer')
    .sort((a, b) => a.sort_order - b.sort_order)

  // ── SSE: event-driven cache invalidation ──

  const handleEvent = useCallback(() => {
    // We could narrow by type, but invalidating all three caches is cheap and
    // covers every mutation path (fire, bump, item toggle, void, recall, serve).
    // ACTIVE_ORDERS_KEY_PREFIX matches every station-filtered variant.
    queryClient.invalidateQueries({ queryKey: ACTIVE_ORDERS_KEY_PREFIX })
    queryClient.invalidateQueries({ queryKey: RECENT_BUMPED_KEY })
    queryClient.invalidateQueries({ queryKey: TAKEAWAY_READY_KEY })
  }, [queryClient])

  const streamStatus = useKitchenStream({ enabled: true, onEvent: handleEvent })

  // ── Derived ──

  const orders = (ordersResponse || []) as Order[]

  const filteredOrders = useMemo(() => {
    if (liveFilter === 'all') return orders
    if (liveFilter === 'urgent') {
      const targetMs = kitchen.urgencyMinutes * 60 * 1000 * 0.9
      return orders.filter((o) => {
        if (o.status === 'ready') return false
        const start = o.kot_first_sent_at || o.created_at
        if (!start) return false
        return Date.now() - new Date(start).getTime() >= targetMs
      })
    }
    return orders.filter((o) => o.order_type === liveFilter)
  }, [orders, liveFilter, kitchen.urgencyMinutes])

  // Sort: critical → urgent → fresh-by-age; ready tickets always at the end.
  const sortedOrders = useMemo(() => {
    const now = Date.now()
    const score = (o: Order): number => {
      if (o.status === 'ready') return 1_000_000
      const start = o.kot_first_sent_at || o.created_at
      if (!start) return now
      const elapsed = now - new Date(start).getTime()
      // Bigger score = higher priority; invert into numeric sort by negating.
      return -elapsed
    }
    return [...filteredOrders].sort((a, b) => score(a) - score(b))
  }, [filteredOrders])

  const urgentCount = useMemo(() => {
    const targetMs = kitchen.urgencyMinutes * 60 * 1000 * 0.9
    return orders.filter((o) => {
      if (o.status === 'ready') return false
      const start = o.kot_first_sent_at || o.created_at
      if (!start) return false
      return Date.now() - new Date(start).getTime() >= targetMs
    }).length
  }, [orders, kitchen.urgencyMinutes])

  const typeCounts = useMemo(() => {
    const base = { dine_in: 0, takeout: 0, delivery: 0 } as Record<string, number>
    for (const o of orders) base[o.order_type] = (base[o.order_type] || 0) + 1
    return base
  }, [orders])

  const atPassCount = useMemo(() => orders.filter((o) => o.status === 'ready').length, [orders])

  // ── Mutations ──

  const markPickedUpMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.updateOrderStatus(orderId, 'served'),
    onSuccess: () => {
      handleEvent()
      toast({
        title: 'Ticket cleared',
        description: 'Order marked as picked up and removed from the line.',
      })
    },
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: 'Could not update order',
        description: err.message || 'Try again.',
      })
    },
  })

  const bumpMutation = useMutation({
    mutationFn: async (order: Order) => {
      const id = typeof order?.id === 'string' ? order.id.trim() : ''
      if (!id) throw new Error('Missing order id — refresh the kitchen screen')
      const res = await apiClient.kitchenBumpOrder(id)
      if (!res.success) throw new Error(res.message || 'Bump failed')
      return { res, order }
    },
    onError: (err: Error) => {
      const msg = err.message || ''
      if (msg.includes('Order not found') || msg.includes('Network Error') || msg.includes('ECONNREFUSED')) {
        handleEvent()
      }
      toast({
        variant: 'destructive',
        title: 'Could not mark order ready',
        description:
          msg.includes('Network Error') || msg.includes('ECONNREFUSED')
            ? 'API unreachable — check that the backend is running, then try again.'
            : msg,
      })
    },
    onSuccess: ({ res, order }) => {
      const data = res.data
      if (data?.ready_for_pickup) {
        publishOrderReady({
          type: 'order_ready_for_pickup',
          orderId: order.id,
          orderNumber: order.order_number,
          tableId: (data.table_id as string | undefined) ?? order.table_id ?? null,
          completionSeconds: data.completion_seconds ?? 0,
          kitchenBumpedAt:
            typeof data.kitchen_bumped_at === 'string' ? data.kitchen_bumped_at : new Date().toISOString(),
        })
      }
      handleEvent()
      if (soundEnabled) playBumpChime(volume)
    },
  })

  const recallMutation = useMutation({
    mutationFn: async (orderId: string) => apiClient.recallOrder(orderId),
    onSuccess: () => {
      handleEvent()
      toast({ title: 'Ticket recalled', description: 'Order is back on the line.' })
    },
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: 'Could not recall order',
        description: err.message || 'The recall window may have expired.',
      })
    },
  })

  const handleLogout = () => {
    apiClient.clearAuth()
    window.location.href = '/login'
  }

  const handleItemTogglePrepared = async (orderId: string, itemId: string, prepared: boolean) => {
    const next = prepared ? 'ready' : 'sent'
    try {
      await apiClient.updateOrderItemStatus(orderId, itemId, next)
      handleEvent()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not update item',
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : 'Unknown error'

  // ── Render ──

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-gray-900">
      {/* Top bar — slim, scannable */}
      <header className="shrink-0 border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 shadow">
              <ChefHat className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
                Kitchen Display
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">
                  {user.first_name} {user.last_name}
                </span>
                <span>·</span>
                <span>{orders.length} active</span>
                <span>·</span>
                <StreamStatusDot status={streamStatus} isFetching={isFetching && !isLoading} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={cn('h-4 w-4', (isLoading || isFetching) && 'animate-spin')} />
            </Button>
            <Button
              variant={prepRailOpen ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPrepRailOpen((v) => !v)}
              aria-label={prepRailOpen ? 'Hide prep queue' : 'Show prep queue'}
              title={prepRailOpen ? 'Hide prep queue' : 'Show prep queue'}
            >
              {prepRailOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSoundSettings((v) => !v)}>
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="text-red-600 hover:text-red-700">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filter row — type chips + station chips */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <FilterChip
            active={liveFilter === 'all'}
            onClick={() => setLiveFilter('all')}
            label="All"
            count={orders.length}
            tone="slate"
          />
          <FilterChip
            active={liveFilter === 'urgent'}
            onClick={() => setLiveFilter('urgent')}
            label="Urgent"
            count={urgentCount}
            tone="red"
            icon={<Flame className="h-3 w-3" />}
          />
          <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-gray-700" aria-hidden />
          <FilterChip
            active={liveFilter === 'dine_in'}
            onClick={() => setLiveFilter('dine_in')}
            label="Dine-in"
            count={typeCounts.dine_in || 0}
            tone="sky"
            icon={<Home className="h-3 w-3" />}
          />
          <FilterChip
            active={liveFilter === 'takeout'}
            onClick={() => setLiveFilter('takeout')}
            label="Takeaway"
            count={typeCounts.takeout || 0}
            tone="violet"
            icon={<ShoppingBag className="h-3 w-3" />}
          />
          <FilterChip
            active={liveFilter === 'delivery'}
            onClick={() => setLiveFilter('delivery')}
            label="Delivery"
            count={typeCounts.delivery || 0}
            tone="indigo"
            icon={<Truck className="h-3 w-3" />}
          />
          {stations.length > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-gray-700" aria-hidden />
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground mr-1">
                <Filter className="h-3 w-3" />
                Station:
              </span>
              <FilterChip
                active={stationFilter === 'all'}
                onClick={() => setStationFilter('all')}
                label="All"
                tone="slate"
              />
              {stations.map((s) => (
                <FilterChip
                  key={s.id}
                  active={stationFilter === s.id}
                  onClick={() => setStationFilter(s.id)}
                  label={s.name}
                  tone={s.output_type === 'kds' ? 'teal' : 'amber'}
                  icon={<Radio className="h-3 w-3" />}
                />
              ))}
            </>
          )}
          {atPassCount > 0 && (
            <Badge className="ml-auto bg-emerald-600 text-white gap-1">
              <Package className="h-3 w-3" />
              {atPassCount} at pass
            </Badge>
          )}
        </div>
      </header>

      {showSoundSettings && (
        <SoundPopover
          enabled={soundEnabled}
          volume={volume}
          onEnabled={setSoundEnabled}
          onVolume={setVolume}
          onClose={() => setShowSoundSettings(false)}
        />
      )}

      {/* Main + rail */}
      <div className="flex min-h-0 flex-1">
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Board */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {isLoading ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3">
                <RefreshCw className="h-10 w-10 animate-spin text-orange-600" />
                <p className="text-sm text-slate-500">Loading kitchen queue…</p>
              </div>
            ) : (
              <>
                {error && (
                  <div
                    role="alert"
                    className="mb-4 flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 shadow-sm sm:flex-row sm:items-center"
                  >
                    <AlertCircle className="h-8 w-8 shrink-0 text-red-600" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-red-900">Could not load orders</p>
                      <p className="mt-1 break-words text-sm text-red-800">{errorMessage}</p>
                    </div>
                    <Button className="shrink-0" onClick={() => refetch()}>
                      Try again
                    </Button>
                  </div>
                )}

                {!error && sortedOrders.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(260px,1fr))] content-start">
                    {sortedOrders.map((order) => (
                      <KOTCard
                        key={order.id}
                        order={order as Order & { kot_first_sent_at?: string; server_name?: string }}
                        targetPrepMinutes={kitchen.urgencyMinutes}
                        staleMinutes={kitchen.staleMinutes}
                        isAtPass={order.status === 'ready'}
                        onItemTogglePrepared={handleItemTogglePrepared}
                        onBump={async (id) => {
                          const o = orders.find((x) => x.id === id) ?? order
                          await bumpMutation.mutateAsync(o)
                        }}
                        bumpLoading={bumpMutation.isPending && bumpMutation.variables?.id === order.id}
                        onPickedUp={(id) => markPickedUpMutation.mutate(id)}
                        pickedUpLoading={
                          markPickedUpMutation.isPending && markPickedUpMutation.variables === order.id
                        }
                        onRecall={
                          order.status === 'ready' && kitchen.recallWindowSeconds > 0
                            ? (id) => recallMutation.mutate(id)
                            : undefined
                        }
                        recallLoading={recallMutation.isPending && recallMutation.variables === order.id}
                      />
                    ))}
                  </div>
                )}

                {/* Takeaway ready board — only show when there are entries so we don't
                    burn screen real estate on an empty section */}
                {takeawayReady.length > 0 && liveFilter !== 'dine_in' && (
                  <div className="mt-6 border-t border-dashed border-slate-300 dark:border-gray-700 pt-4">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <Package className="h-4 w-4" />
                      Takeaway — ready for pickup
                    </h2>
                    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                      {takeawayReady.map((o) => (
                        <TakeawayReadyCard
                          key={o.id}
                          order={o}
                          onPickedUp={() => markPickedUpMutation.mutate(o.id)}
                          loading={markPickedUpMutation.isPending && markPickedUpMutation.variables === o.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Recall strip — anchored to the bottom of the board; hidden when empty. */}
          {recentBumped.length > 0 && kitchen.recallWindowSeconds > 0 && (
            <div className="shrink-0 border-t border-slate-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur px-3 py-2">
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  <Undo2 className="h-3.5 w-3.5" />
                  Recall ({kitchen.recallWindowSeconds}s window)
                </span>
                <div className="flex gap-1.5">
                  {recentBumped.map((b) => (
                    <Button
                      key={b.id}
                      variant="outline"
                      size="sm"
                      disabled={recallMutation.isPending && recallMutation.variables === b.id}
                      onClick={() => recallMutation.mutate(b.id)}
                      className="h-8 text-xs gap-1.5 border-slate-300 dark:border-gray-600 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                      title={
                        b.table_number
                          ? `Table ${b.table_number}`
                          : b.customer_name || 'Takeaway'
                      }
                    >
                      <Undo2 className="h-3 w-3" />
                      {displayTicketNo(b.order_number)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Prep rail */}
        {prepRailOpen && (
          <aside className="hidden md:flex shrink-0 w-72 lg:w-80 border-l border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <ConsolidatedPrepList orders={sortedOrders.filter((o) => o.status !== 'ready')} rail />
          </aside>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──

interface FilterChipProps {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  tone: 'slate' | 'sky' | 'violet' | 'indigo' | 'red' | 'amber' | 'teal'
  icon?: React.ReactNode
}

const TONE_CLASSES: Record<FilterChipProps['tone'], { active: string; idle: string }> = {
  slate: {
    active: 'bg-slate-900 text-white border-slate-900',
    idle: 'bg-white text-slate-700 border-slate-200 hover:border-slate-400',
  },
  sky: {
    active: 'bg-sky-600 text-white border-sky-600',
    idle: 'bg-white text-sky-800 border-sky-200 hover:border-sky-400',
  },
  violet: {
    active: 'bg-violet-600 text-white border-violet-600',
    idle: 'bg-white text-violet-800 border-violet-200 hover:border-violet-400',
  },
  indigo: {
    active: 'bg-indigo-600 text-white border-indigo-600',
    idle: 'bg-white text-indigo-800 border-indigo-200 hover:border-indigo-400',
  },
  red: {
    active: 'bg-red-600 text-white border-red-600',
    idle: 'bg-white text-red-700 border-red-200 hover:border-red-400',
  },
  amber: {
    active: 'bg-amber-500 text-white border-amber-500',
    idle: 'bg-white text-amber-800 border-amber-200 hover:border-amber-400',
  },
  teal: {
    active: 'bg-teal-600 text-white border-teal-600',
    idle: 'bg-white text-teal-800 border-teal-200 hover:border-teal-400',
  },
}

function FilterChip({ active, onClick, label, count, tone, icon }: FilterChipProps) {
  const styles = TONE_CLASSES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors dark:bg-gray-900 dark:border-gray-600',
        active ? styles.active : styles.idle,
      )}
    >
      {icon}
      {label}
      {typeof count === 'number' && count > 0 && (
        <span
          className={cn(
            'ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
            active ? 'bg-white/25' : 'bg-slate-100 text-slate-700 dark:bg-gray-700 dark:text-slate-300',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function StreamStatusDot({
  status,
  isFetching,
}: {
  status: 'connecting' | 'live' | 'offline'
  isFetching: boolean
}) {
  const meta =
    status === 'live'
      ? { label: isFetching ? 'Live · syncing' : 'Live', dot: 'bg-emerald-500 animate-pulse' }
      : status === 'connecting'
        ? { label: 'Connecting', dot: 'bg-amber-500 animate-pulse' }
        : { label: 'Offline · polling', dot: 'bg-slate-400' }
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 dark:bg-gray-800">
        <ChefHat className="h-8 w-8 text-slate-500" />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        No tickets on the line
      </p>
      <p className="mt-1 text-xs text-muted-foreground max-w-xs">
        Fired KOTs will appear here as cards sorted by urgency. You can filter by order type or station above.
      </p>
    </div>
  )
}

function TakeawayReadyCard({
  order,
  onPickedUp,
  loading,
}: {
  order: Order
  onPickedUp: () => void
  loading: boolean
}) {
  const waitTime = Math.floor((Date.now() - new Date(order.updated_at).getTime()) / 1000 / 60)
  return (
    <Card className="border-emerald-400 bg-emerald-50/70 dark:bg-emerald-900/20 dark:border-emerald-700">
      <CardContent className="p-3 text-center">
        <div className="text-xl font-black text-emerald-900 dark:text-emerald-200">
          {displayTicketNo(order.order_number)}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {order.customer_name || 'Guest'}
        </div>
        <div className="text-[11px] text-muted-foreground mb-2">
          {waitTime <= 0 ? 'Just ready' : `Ready ${waitTime}m ago`}
        </div>
        <Button
          size="sm"
          className="w-full h-8 bg-slate-800 hover:bg-slate-900 text-xs"
          disabled={loading}
          onClick={onPickedUp}
        >
          {loading ? 'Updating…' : 'Picked up'}
        </Button>
      </CardContent>
    </Card>
  )
}

function SoundPopover({
  enabled,
  volume,
  onEnabled,
  onVolume,
  onClose,
}: {
  enabled: boolean
  volume: number
  onEnabled: (v: boolean) => void
  onVolume: (v: number) => void
  onClose: () => void
}) {
  return (
    <div className="relative z-40">
      <div
        className="absolute right-4 top-2 w-72 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-xl"
        role="dialog"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">Sound</span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            ×
          </Button>
        </div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm">Enable chimes</label>
          <button
            type="button"
            onClick={() => onEnabled(!enabled)}
            className={cn(
              'w-10 h-5 rounded-full transition-colors relative',
              enabled ? 'bg-primary' : 'bg-slate-300 dark:bg-gray-600',
            )}
          >
            <span
              className={cn(
                'block h-4 w-4 rounded-full bg-white absolute top-0.5 transition-transform',
                enabled ? 'translate-x-5' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>
        <label className="text-sm block mb-1.5">Volume</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={volume}
          onChange={(e) => onVolume(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  )
}

function playBumpChime(volume: number) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.setValueAtTime(880, ctx.currentTime)
    g.gain.setValueAtTime(volume * 0.25, ctx.currentTime)
    o.start()
    o.stop(ctx.currentTime + 0.2)
  } catch {
    /* sound is optional */
  }
}
