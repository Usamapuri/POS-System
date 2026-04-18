import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowRightLeft, Check, ClipboardList, X } from 'lucide-react'
import type { DiningTable, Order } from '@/types'
import type { TableSession } from '@/components/counter/TableSessionModal'
import { ticketPillClasses, type TicketLifecycleMeta } from './ticketState'

export interface TicketHeaderProps {
  orderType: 'dine_in' | 'takeout' | 'delivery'
  selectedTable: DiningTable | null
  existingOrder: Order | null
  dineInSession: TableSession | null
  customerName: string
  checkoutOpen: boolean
  lifecycle: TicketLifecycleMeta
  continuingOrderId: string | null
  /**
   * Transient inline affirmation shown after items are fired to the kitchen.
   * Replaces the previous floating "Add-on sent" / "Sent to kitchen" toast,
   * which overlapped the Totals and primary CTA in the rail.
   */
  firedConfirmation?: { count: number; mode: 'new' | 'continue' } | null
  onChangeTable?: () => void
  onCloseCheckout?: () => void
}

const orderTypeLabel: Record<TicketHeaderProps['orderType'], string> = {
  dine_in: 'Dine-in',
  takeout: 'Takeout',
  delivery: 'Delivery',
}

export function TicketHeader({
  orderType,
  selectedTable,
  existingOrder,
  dineInSession,
  customerName,
  checkoutOpen,
  lifecycle,
  continuingOrderId,
  firedConfirmation,
  onChangeTable,
  onCloseCheckout,
}: TicketHeaderProps) {
  const showTableIdentity = orderType === 'dine_in' && (selectedTable || existingOrder?.table)
  const tableNumber = selectedTable?.table_number ?? existingOrder?.table?.table_number
  const orderNumber = existingOrder?.order_number
  const rawGuests = dineInSession?.guestCount ?? existingOrder?.guest_count ?? null
  const guests = rawGuests != null && rawGuests > 0 ? rawGuests : null
  const serverName =
    dineInSession?.serverDisplayName ??
    (existingOrder?.user
      ? `${existingOrder.user.first_name ?? ''} ${existingOrder.user.last_name ?? ''}`.trim() ||
        existingOrder.user.username
      : undefined)

  const openedAt = existingOrder?.table_opened_at

  const secondaryBits: string[] = []
  if (guests != null) secondaryBits.push(`${guests} ${guests === 1 ? 'guest' : 'guests'}`)
  if (serverName) secondaryBits.push(`Server ${serverName}`)
  if (openedAt) {
    secondaryBits.push(
      `Opened ${new Date(openedAt).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })}`
    )
  }

  return (
    <header
      aria-label="Ticket context"
      className="flex flex-col gap-2 border-b border-border/80 bg-card/95 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-border/80 bg-muted/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {orderTypeLabel[orderType]}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                ticketPillClasses(lifecycle.tone)
              )}
            >
              {lifecycle.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {showTableIdentity && tableNumber ? (
              <span className="text-base font-semibold tracking-tight">
                <span className="text-muted-foreground">Table </span>
                {tableNumber}
              </span>
            ) : customerName ? (
              <span className="truncate text-base font-semibold tracking-tight">
                {customerName}
              </span>
            ) : orderType !== 'dine_in' ? (
              <span className="text-sm text-muted-foreground">Walk-in customer</span>
            ) : null}
            {orderNumber && (
              <span className="text-sm text-muted-foreground">
                Order <span className="font-medium text-foreground">#{orderNumber}</span>
              </span>
            )}
          </div>
          {secondaryBits.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              {secondaryBits.map((bit, i) => (
                <span key={`${bit}-${i}`}>
                  {i > 0 ? <span aria-hidden>· </span> : null}
                  {bit}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">{lifecycle.helper}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {checkoutOpen && onCloseCheckout && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={onCloseCheckout}
              aria-label="Close checkout"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
          )}
          {orderType === 'dine_in' && existingOrder && continuingOrderId && onChangeTable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={onChangeTable}
              aria-label="Change table"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Change table
            </Button>
          )}
        </div>
      </div>
      {existingOrder && !checkoutOpen && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
          <span>
            {existingOrder.kot_first_sent_at
              ? 'Items have been fired to the kitchen'
              : 'No items fired yet'}
          </span>
        </div>
      )}
      {firedConfirmation && (
        <div
          role="status"
          aria-live="polite"
          className="counter-fired-chip inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-200"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          <span>
            {firedConfirmation.count} {firedConfirmation.count === 1 ? 'item' : 'items'}{' '}
            {firedConfirmation.mode === 'continue' ? 'added to kitchen' : 'sent to kitchen'}
          </span>
        </div>
      )}
    </header>
  )
}
