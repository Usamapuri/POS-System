import type { Order, OrderItem } from '@/types';

/** Kanban lanes: ticket in kitchen → cooking → all items done → at pass */
export type KdsColumnId = 'placed' | 'preparing' | 'atPass';

export const KDS_COLUMN_META: Record<
  KdsColumnId,
  { label: string; short: string; description: string; headerClass: string }
> = {
  placed: {
    label: 'Placed',
    short: 'Cooking',
    description: 'On the line — not yet all prepared',
    headerClass: 'from-amber-500 to-orange-600',
  },
  preparing: {
    label: 'Preparing',
    short: 'Finish',
    description: 'All items cooked — bump when at the pass',
    headerClass: 'from-teal-600 to-cyan-700',
  },
  atPass: {
    label: 'Ready',
    short: 'Pass',
    description: 'At the pass — server pickup',
    headerClass: 'from-emerald-600 to-green-700',
  },
};

function activeItems(order: Order): OrderItem[] {
  return (order.items ?? []).filter((i) => i.status !== 'voided' && i.status !== 'draft');
}

/** Route each order into a Kanban column (item-aware, not only order.status). */
export function assignKdsColumn(order: Order): KdsColumnId {
  if (order.status === 'ready') return 'atPass';

  const items = activeItems(order);
  if (items.length === 0) return 'placed';

  // After KOT fire, lines are `sent` until kitchen marks prepared — that is still an active ticket (Placed).
  const allSent = items.every((i) => i.status === 'sent');
  if (allSent) return 'placed';

  const allDone = items.every((i) => i.status === 'ready' || i.status === 'served');
  if (allDone) return 'preparing';

  return 'placed';
}

export function partitionKdsOrders(orders: Order[]): Record<KdsColumnId, Order[]> {
  const empty: Record<KdsColumnId, Order[]> = {
    placed: [],
    preparing: [],
    atPass: [],
  };
  for (const o of orders) {
    empty[assignKdsColumn(o)].push(o);
  }
  return empty;
}
