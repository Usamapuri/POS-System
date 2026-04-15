import { useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CheckCircle, Clock, Flame, Package, Printer } from 'lucide-react'
import { useKdsUrgencyTimer } from './useKdsUrgencyTimer'
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
  /** Hybrid: JSON payloads for KDS stations (for debugging / future rich UI) */
  lastKotPayloads?: KOTStationPayload[]
  targetPrepMinutes?: number
  /** Order status is `ready` — at pass; hide bump and show pickup state */
  isAtPass?: boolean
  onItemTogglePrepared: (orderId: string, itemId: string, nextPrepared: boolean) => void
  onBump: (orderId: string) => Promise<void>
  bumpLoading?: boolean
  /** Clear ticket from KDS after food is picked up (order → served) */
  onPickedUp?: (orderId: string) => void
  pickedUpLoading?: boolean
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

export function KOTCard({
  order,
  lastKotPayloads,
  targetPrepMinutes = 15,
  isAtPass = false,
  onItemTogglePrepared,
  onBump,
  bumpLoading,
  onPickedUp,
  pickedUpLoading,
}: KOTCardProps) {
  const kotFirst = order.kot_first_sent_at
  const { elapsedLabel, isUrgent } = useKdsUrgencyTimer(kotFirst, order.created_at, targetPrepMinutes)

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

  return (
    <Card
      className={cn(
        'w-full min-h-[420px] flex flex-col border-2 transition-colors',
        isAtPass && 'border-emerald-400 bg-emerald-50/80 shadow-md',
        !isAtPass &&
          isUrgent &&
          'border-red-600 bg-red-50/90 shadow-[0_0_0_1px_rgba(220,38,38,0.5)] animate-pulse',
        !isAtPass && !isUrgent && 'border-slate-200 bg-white'
      )}
    >
      <CardHeader
        className={cn(
          'pb-3 border-b space-y-2',
          isUrgent ? 'bg-red-600/10' : 'bg-slate-50'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-2xl font-black tracking-tight text-slate-900">
              {displayTicketNo(order.order_number)}
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="font-semibold">
                Table {tableLabel}
              </Badge>
              <Badge variant="secondary" className="font-semibold">
                {covers} covers
              </Badge>
              {order.server_name && (
                <span className="text-muted-foreground text-xs">Server: {order.server_name}</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div
              className={cn(
                'flex items-center justify-end gap-1 text-lg font-mono font-bold tabular-nums',
                isUrgent ? 'text-red-700' : 'text-slate-800'
              )}
            >
              <Clock className={cn('h-5 w-5', isUrgent && 'text-red-600')} />
              {elapsedLabel}
            </div>
            <div className="text-[10px] uppercase text-muted-foreground">since KOT</div>
            {isUrgent && (
              <Badge className="mt-1 bg-red-600 text-white gap-1">
                <Flame className="h-3 w-3" />
                Urgent
              </Badge>
            )}
          </div>
        </div>

        {lastKotPayloads && lastKotPayloads.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {lastKotPayloads.map((k, i) => (
              <Badge key={i} variant="outline" className="text-[10px] gap-1 font-normal">
                {k.output_type === 'printer' ? (
                  <Printer className="h-3 w-3" />
                ) : (
                  <Package className="h-3 w-3" />
                )}
                {k.station_name ?? 'Station'}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col pt-4 space-y-3">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
          <Package className="h-3.5 w-3.5" />
          Items
        </h4>

        <div className="space-y-2 flex-1">
          {regularItems.length === 0 && voidedItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No items</p>
          )}

          {regularItems.map(item => {
            const prepared = isItemPrepared(item)
            const gen = (item as OrderItem & { kot_fire_generation?: number }).kot_fire_generation ?? 1
            const isNew = gen > 1

            return (
              <button
                key={item.id}
                type="button"
                disabled={item.status === 'voided' || isAtPass}
                onClick={() =>
                  onItemTogglePrepared(order.id, item.id, !prepared)
                }
                className={cn(
                  'w-full text-left rounded-lg border p-3 transition-colors',
                  prepared
                    ? 'border-green-400 bg-green-50'
                    : 'border-slate-200 bg-white hover:border-amber-300'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
                        prepared ? 'border-green-500 bg-green-500 text-white' : 'border-slate-300'
                      )}
                    >
                      {prepared && <CheckCircle className="h-5 w-5" />}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">
                        {item.quantity}× {item.product?.name ?? 'Item'}
                      </div>
                      {item.special_instructions && (
                        <p className="text-xs text-amber-800 mt-1">{item.special_instructions}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {isNew && (
                          <Badge className="bg-amber-500 hover:bg-amber-500 text-[10px]">NEW</Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {prepared ? 'Prepared' : 'Cooking'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}

          {voidedItems.map(item => (
            <div
              key={item.id}
              className="rounded-lg border border-red-200 bg-red-50/50 p-3 opacity-90"
            >
              <div className="line-through text-red-900 font-medium">
                {item.quantity}× {item.product?.name ?? 'Item'}
              </div>
              <Badge variant="destructive" className="mt-1 text-[10px]">
                VOIDED
              </Badge>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t mt-auto space-y-2">
          {isAtPass ? (
            <div className="space-y-2">
              <div className="rounded-lg bg-emerald-600/10 border border-emerald-500/40 py-3 px-2 text-center">
                <p className="text-sm font-semibold text-emerald-900">At the pass</p>
                <p className="text-xs text-emerald-800/90 mt-1">Waiting for server pickup</p>
              </div>
              {onPickedUp && (
                <Button
                  type="button"
                  className="w-full h-12 text-base font-semibold bg-slate-800 hover:bg-slate-900"
                  disabled={pickedUpLoading}
                  onClick={() => onPickedUp(order.id)}
                >
                  {pickedUpLoading ? 'Updating…' : 'Picked up — clear from KDS'}
                </Button>
              )}
            </div>
          ) : (
            <>
              <Button
                className="w-full h-12 text-lg font-semibold bg-orange-600 hover:bg-orange-700"
                disabled={bumpLoading || !allActivePrepared}
                onClick={handleBump}
              >
                {bumpLoading ? 'Bumping…' : 'Order complete (Bump)'}
              </Button>
              {!allActivePrepared && regularItems.length > 0 && (
                <p className="text-xs text-center text-muted-foreground">
                  Mark all active items as prepared to bump
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
