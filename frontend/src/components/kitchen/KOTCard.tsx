import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  CheckCircle,
  Clock,
  Flame,
  Package,
  Printer,
  Users,
  Home,
  ShoppingBag,
  Truck,
  Undo2,
  Hourglass,
  AlertTriangle,
} from 'lucide-react'
import { useKdsUrgencyTimer, type UrgencyTier } from './useKdsUrgencyTimer'
import type { Order, OrderItem } from '@/types'

/** Optional: last fire response JSON per station (KDS); printer stations use string — not rendered here */
export interface KOTStationPayload {
  station_id?: string
  station_name?: string
  output_type: 'kds' | 'printer'
  payload: unknown
}

export interface KOTCardProps {
  order: Order & {
    kot_first_sent_at?: string
    guest_count?: number
    server_name?: string
    table?: { table_number?: string; location?: string }
  }
  lastKotPayloads?: KOTStationPayload[]
  targetPrepMinutes?: number
  staleMinutes?: number
  /** Order status is `ready` — at pass; hide bump and show pickup state */
  isAtPass?: boolean
  onItemTogglePrepared: (orderId: string, itemId: string, nextPrepared: boolean) => void
  onBump: (orderId: string) => Promise<void>
  bumpLoading?: boolean
  /** Clear ticket from KDS after food is picked up (order → served) */
  onPickedUp?: (orderId: string) => void
  pickedUpLoading?: boolean
  /** Recall from the at-pass lane back to the line. Only shown when order is ready. */
  onRecall?: (orderId: string) => void
  recallLoading?: boolean
}

function isItemPrepared(item: OrderItem): boolean {
  return item.status === 'ready' || item.status === 'served'
}

function isVoided(item: OrderItem): boolean {
  return item.status === 'voided'
}

/** Daily tickets: 20260413-001 → #001; legacy ORD202604139987 → #9987 (last 4). */
export function displayTicketNo(orderNumber: string): string {
  const daily = orderNumber.match(/^(\d{8})-(\d{1,4})$/)
  if (daily) return `#${daily[2].padStart(3, '0')}`
  const ord = orderNumber.match(/^ORD(\d{8})(\d{4})$/i)
  if (ord) return `#${ord[2]}`
  return `#${orderNumber}`
}

/** 60s from fire: long enough for staff to notice, short enough to avoid "NEW forever". */
const NEW_BADGE_WINDOW_MS = 60_000

function useIsStillNew(kotSentAt: string | undefined, generation: number): boolean {
  const [stillNew, setStillNew] = useState<boolean>(() => {
    if (generation <= 1 || !kotSentAt) return false
    return Date.now() - new Date(kotSentAt).getTime() < NEW_BADGE_WINDOW_MS
  })
  useEffect(() => {
    if (generation <= 1 || !kotSentAt) {
      setStillNew(false)
      return
    }
    const elapsed = Date.now() - new Date(kotSentAt).getTime()
    if (elapsed >= NEW_BADGE_WINDOW_MS) {
      setStillNew(false)
      return
    }
    const t = window.setTimeout(
      () => setStillNew(false),
      NEW_BADGE_WINDOW_MS - elapsed,
    )
    return () => window.clearTimeout(t)
  }, [kotSentAt, generation])
  return stillNew
}

/** Map urgency tier to card chrome (border + header tint). */
const TIER_STYLE: Record<UrgencyTier, { border: string; header: string; clock: string }> = {
  fresh: {
    border: 'border-emerald-300 dark:border-emerald-700',
    header: 'bg-emerald-50/60 dark:bg-emerald-900/10',
    clock: 'text-emerald-700 dark:text-emerald-300',
  },
  warming: {
    border: 'border-amber-400 dark:border-amber-600',
    header: 'bg-amber-50 dark:bg-amber-900/20',
    clock: 'text-amber-800 dark:text-amber-200',
  },
  urgent: {
    border: 'border-red-500 dark:border-red-600',
    header: 'bg-red-50 dark:bg-red-900/20',
    clock: 'text-red-700 dark:text-red-300',
  },
  critical: {
    border: 'border-red-600 dark:border-red-500 shadow-[0_0_0_1px_rgba(220,38,38,0.5)]',
    header: 'bg-red-100 dark:bg-red-900/30',
    clock: 'text-red-800 dark:text-red-200',
  },
  stale: {
    border: 'border-slate-400 border-dashed',
    header: 'bg-slate-100 dark:bg-gray-800',
    clock: 'text-slate-600 dark:text-slate-400',
  },
}

function OrderTypeBadge({ type }: { type: Order['order_type'] }) {
  const meta: Record<string, { icon: React.ElementType; label: string; tone: string }> = {
    dine_in: { icon: Home, label: 'Dine-in', tone: 'bg-sky-100 text-sky-800 border-sky-200' },
    takeout: { icon: ShoppingBag, label: 'Takeaway', tone: 'bg-violet-100 text-violet-800 border-violet-200' },
    delivery: { icon: Truck, label: 'Delivery', tone: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  }
  const m = meta[type] ?? { icon: Home, label: type, tone: 'bg-slate-100 text-slate-800 border-slate-200' }
  const Icon = m.icon
  return (
    <Badge variant="outline" className={cn('gap-1 font-semibold border', m.tone)}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  )
}

export function KOTCard({
  order,
  lastKotPayloads,
  targetPrepMinutes = 15,
  staleMinutes = 120,
  isAtPass = false,
  onItemTogglePrepared,
  onBump,
  bumpLoading,
  onPickedUp,
  pickedUpLoading,
  onRecall,
  recallLoading,
}: KOTCardProps) {
  const kotFirst = order.kot_first_sent_at
  const urgency = useKdsUrgencyTimer(kotFirst, order.created_at, targetPrepMinutes, staleMinutes)
  const style = TIER_STYLE[urgency.tier]
  const animate = urgency.tier === 'critical' && !isAtPass

  const tableLabel = order.table?.table_number ?? order.table_id ?? '—'
  const covers = order.guest_count ?? 0
  const items = order.items ?? []

  const { regularItems, voidedItems } = useMemo(() => {
    const reg: OrderItem[] = []
    const vo: OrderItem[] = []
    for (const it of items) {
      if (isVoided(it)) vo.push(it)
      else reg.push(it)
    }
    return { regularItems: reg, voidedItems: vo }
  }, [items])

  const allActivePrepared = useMemo(() => {
    const active = regularItems.filter((i) => i.status !== 'voided')
    if (active.length === 0) return false
    return active.every((i) => isItemPrepared(i))
  }, [regularItems])

  const handleBump = useCallback(async () => {
    await onBump(order.id)
  }, [onBump, order.id])

  const isStale = urgency.tier === 'stale'
  const showDineIn = order.order_type === 'dine_in'

  return (
    <Card
      className={cn(
        'w-full flex flex-col border-2 transition-colors overflow-hidden',
        isAtPass
          ? 'border-emerald-400 bg-emerald-50/80 dark:bg-emerald-900/10 dark:border-emerald-600 shadow-md'
          : cn(style.border, 'bg-white dark:bg-gray-900'),
        animate && 'animate-pulse',
      )}
    >
      <CardHeader
        className={cn(
          'pb-3 border-b space-y-2 dark:border-gray-700',
          isAtPass ? 'bg-emerald-100/60 dark:bg-emerald-900/20' : style.header,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 leading-none">
              {displayTicketNo(order.order_number)}
            </CardTitle>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <OrderTypeBadge type={order.order_type} />
              {showDineIn && (
                <>
                  <Badge variant="outline" className="font-semibold">
                    Table {tableLabel}
                  </Badge>
                  {covers > 0 && (
                    <Badge variant="secondary" className="font-semibold gap-1">
                      <Users className="h-3 w-3" />
                      {covers}
                    </Badge>
                  )}
                </>
              )}
              {!showDineIn && order.customer_name && (
                <span className="text-muted-foreground font-medium truncate max-w-[140px]">
                  {order.customer_name}
                </span>
              )}
            </div>
            {order.server_name && showDineIn && (
              <p className="mt-1 text-[11px] text-muted-foreground truncate">Server: {order.server_name}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className={cn('flex items-center justify-end gap-1 text-lg font-mono font-bold tabular-nums', style.clock)}>
              {isStale ? <Hourglass className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
              {urgency.elapsedLabel}
            </div>
            <div className="text-[10px] uppercase text-muted-foreground">since KOT</div>
            {urgency.tier === 'critical' && (
              <Badge className="mt-1 bg-red-600 text-white gap-1 text-[10px]">
                <Flame className="h-3 w-3" />
                Critical
              </Badge>
            )}
            {urgency.tier === 'urgent' && (
              <Badge className="mt-1 bg-red-500 text-white gap-1 text-[10px]">
                <Flame className="h-3 w-3" />
                Urgent
              </Badge>
            )}
            {isStale && (
              <Badge variant="outline" className="mt-1 text-[10px] gap-1">
                <AlertTriangle className="h-3 w-3" />
                Stale
              </Badge>
            )}
          </div>
        </div>

        {lastKotPayloads && lastKotPayloads.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {lastKotPayloads.map((k, i) => (
              <Badge key={i} variant="outline" className="text-[10px] gap-1 font-normal">
                {k.output_type === 'printer' ? <Printer className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                {k.station_name ?? 'Station'}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col pt-3 pb-3 space-y-2">
        <div className="space-y-1.5 flex-1">
          {regularItems.length === 0 && voidedItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No items</p>
          )}

          {regularItems.map((item) => (
            <KOTLine
              key={item.id}
              item={item}
              orderId={order.id}
              disabled={isAtPass}
              onToggle={onItemTogglePrepared}
            />
          ))}

          {voidedItems.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-red-200 bg-red-50/70 dark:bg-red-900/10 dark:border-red-800 p-2 text-sm"
            >
              <div className="line-through text-red-900 dark:text-red-300 font-medium">
                {item.quantity}× {item.product?.name ?? 'Item'}
              </div>
              <Badge variant="destructive" className="mt-1 text-[10px]">
                VOIDED
              </Badge>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t dark:border-gray-700 mt-auto space-y-2">
          {isAtPass ? (
            <div className="space-y-2">
              <div className="rounded-lg bg-emerald-600/10 border border-emerald-500/40 py-2 px-2 text-center">
                <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">At the pass</p>
                <p className="text-[10px] text-emerald-800/90 dark:text-emerald-300/90">Waiting for server pickup</p>
              </div>
              <div className="flex gap-2">
                {onPickedUp && (
                  <Button
                    type="button"
                    className="flex-1 h-10 text-sm font-semibold bg-slate-800 hover:bg-slate-900"
                    disabled={pickedUpLoading}
                    onClick={() => onPickedUp(order.id)}
                  >
                    {pickedUpLoading ? 'Updating…' : 'Picked up'}
                  </Button>
                )}
                {onRecall && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={recallLoading}
                    onClick={() => onRecall(order.id)}
                    aria-label="Recall to line"
                    title="Recall to line"
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <Button
                className={cn(
                  'w-full h-11 text-base font-semibold',
                  allActivePrepared
                    ? 'bg-orange-600 hover:bg-orange-700'
                    : 'bg-slate-300 dark:bg-gray-700 text-slate-500 dark:text-slate-400 hover:bg-slate-300 cursor-not-allowed',
                )}
                disabled={bumpLoading || !allActivePrepared}
                onClick={handleBump}
              >
                {bumpLoading ? 'Bumping…' : 'Bump'}
              </Button>
              {!allActivePrepared && regularItems.length > 0 && (
                <p className="text-[11px] text-center text-muted-foreground">
                  Tap each item to mark prepared, then Bump
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface KOTLineProps {
  item: OrderItem
  orderId: string
  disabled: boolean
  onToggle: (orderId: string, itemId: string, nextPrepared: boolean) => void
}

function KOTLine({ item, orderId, disabled, onToggle }: KOTLineProps) {
  const prepared = isItemPrepared(item)
  const gen = (item as OrderItem & { kot_fire_generation?: number }).kot_fire_generation ?? 1
  const sentAt = (item as OrderItem & { kot_sent_at?: string }).kot_sent_at
  const stillNew = useIsStillNew(sentAt, gen)

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(orderId, item.id, !prepared)}
      className={cn(
        'w-full text-left rounded-lg border p-2 transition-colors',
        prepared
          ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-700'
          : stillNew
            ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-900/15 dark:border-amber-700 hover:border-amber-400'
            : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-300',
        disabled && 'opacity-80 cursor-not-allowed',
      )}
    >
      <div className="flex items-start gap-2 min-w-0">
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
            prepared ? 'border-green-500 bg-green-500 text-white' : 'border-slate-300 dark:border-gray-600',
          )}
        >
          {prepared && <CheckCircle className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-tight">
            {item.quantity}× {item.product?.name ?? 'Item'}
          </div>
          {item.special_instructions && (
            <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-tight">
              {item.special_instructions}
            </p>
          )}
          {stillNew && (
            <Badge className="mt-1 bg-amber-500 hover:bg-amber-500 text-white text-[9px] h-4 px-1.5">
              NEW
            </Badge>
          )}
        </div>
      </div>
    </button>
  )
}
