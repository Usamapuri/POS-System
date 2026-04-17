import type { Order } from '@/types'

export type TicketLifecycle =
  | 'empty'
  | 'open_tab'
  | 'staging'
  | 'fired'
  | 'adding'
  | 'ready_to_pay'
  | 'partial_paid'
  | 'closed'

export interface TicketLifecycleInput {
  order: Order | null | undefined
  cartCount: number
  checkoutOpen: boolean
  payableRemaining: number
}

export interface TicketLifecycleMeta {
  /** Machine value */
  state: TicketLifecycle
  /** Short label shown as pill (e.g. "Open tab", "Adding items") */
  label: string
  /** One-line sub-label under the pill */
  helper: string
  /** Visual tone for the pill */
  tone: 'neutral' | 'amber' | 'emerald' | 'violet' | 'sky' | 'slate'
}

/** Count non-voided items sent to the kitchen. */
export function countFiredItems(order: Order | null | undefined): number {
  if (!order?.items?.length) return 0
  return order.items.filter((i) => i.status !== 'voided' && i.status !== 'draft').length
}

/** Central lifecycle resolver for the right rail ticket. */
export function getTicketLifecycle(input: TicketLifecycleInput): TicketLifecycleMeta {
  const { order, cartCount, checkoutOpen, payableRemaining } = input
  const fired = countFiredItems(order)
  const hasCart = cartCount > 0

  if (checkoutOpen && order) {
    if (payableRemaining <= 0) {
      return {
        state: 'closed',
        label: 'Closed',
        helper: 'Fully paid',
        tone: 'slate',
      }
    }
    const anyPaid = (order.payments ?? []).some((p) => p.status === 'completed')
    if (anyPaid) {
      return {
        state: 'partial_paid',
        label: 'Partial',
        helper: 'Awaiting remaining balance',
        tone: 'violet',
      }
    }
    return {
      state: 'ready_to_pay',
      label: 'Ready to pay',
      helper: 'Choose tender and complete payment',
      tone: 'violet',
    }
  }

  if (!order && !hasCart) {
    return {
      state: 'empty',
      label: 'Empty',
      helper: 'Pick a table or order type to start',
      tone: 'neutral',
    }
  }

  if (order && fired === 0 && !hasCart) {
    return {
      state: 'open_tab',
      label: 'Open tab',
      helper: 'Order reserved — add items to fire',
      tone: 'amber',
    }
  }

  if (order && fired > 0 && hasCart) {
    return {
      state: 'adding',
      label: 'Adding items',
      helper: 'New items will fire on Send',
      tone: 'sky',
    }
  }

  if (!order && hasCart) {
    return {
      state: 'staging',
      label: 'Staging',
      helper: 'Items not yet sent to the kitchen',
      tone: 'sky',
    }
  }

  if (order && fired > 0 && !hasCart) {
    return {
      state: 'fired',
      label: 'Fired',
      helper: 'All items on check',
      tone: 'emerald',
    }
  }

  return {
    state: 'staging',
    label: 'Staging',
    helper: 'Items not yet sent to the kitchen',
    tone: 'sky',
  }
}

export function orderPayableRemaining(order: Order | null | undefined): number {
  if (!order) return 0
  if (order.status === 'completed' || order.status === 'cancelled') return 0
  const paid =
    order.payments?.filter((p) => p.status === 'completed').reduce((s, p) => s + p.amount, 0) ?? 0
  return Math.max(0, order.total_amount - paid)
}

/** Tailwind classes for the lifecycle pill by tone. */
export function ticketPillClasses(tone: TicketLifecycleMeta['tone']): string {
  switch (tone) {
    case 'amber':
      return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100'
    case 'emerald':
      return 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100'
    case 'violet':
      return 'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-100'
    case 'sky':
      return 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-100'
    case 'slate':
      return 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200'
    case 'neutral':
    default:
      return 'border-border bg-muted/40 text-foreground'
  }
}
