import { useState } from 'react'
import { ChevronDown, ChevronUp, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category, Order } from '@/types'

export interface SentItemsSectionProps {
  order: Order | null
  categoryById: Map<string, Category>
  /** Category accent color function (usually inherited from the parent). */
  categoryColor: (cat: Category | undefined, fallback: string) => string
  formatCurrency: (n: number) => string
  /** Default expanded state for the section. */
  defaultExpanded?: boolean
}

const statusBadgeClass: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  preparing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  ready: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  served: 'bg-muted text-muted-foreground dark:bg-muted/80',
}

export function SentItemsSection({
  order,
  categoryById,
  categoryColor,
  formatCurrency,
  defaultExpanded = true,
}: SentItemsSectionProps) {
  const items = (order?.items ?? []).filter((i) => i.status !== 'voided' && i.status !== 'draft')
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (!order || items.length === 0) return null

  const total = items.reduce((s, i) => s + i.total_price, 0)

  return (
    <section aria-labelledby="sent-items-heading" className="rounded-lg border border-border bg-muted/15">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-t-lg px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            On order
          </div>
          <div id="sent-items-heading" className="flex items-center gap-2 text-sm font-medium">
            <Flame className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" aria-hidden />
            Order #{order.order_number} · {items.length}
            <span className="text-muted-foreground font-normal">items</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>
      </button>
      {expanded && (
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full min-w-[300px] table-fixed border-collapse border border-border text-sm">
            <colgroup>
              <col style={{ width: '44%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '22%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Item
                </th>
                <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Qty
                </th>
                <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Amount
                </th>
                <th className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const exCat = item.product?.category_id ? categoryById.get(item.product.category_id) : undefined
                const exAccent = categoryColor(exCat, item.product?.name ?? 'Item')
                return (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-b-0 border-l-[3px]"
                    style={{
                      borderLeftColor: exAccent,
                      backgroundColor: `color-mix(in srgb, ${exAccent} 10%, var(--card))`,
                    }}
                  >
                    <td className="min-w-0 px-2 py-2">
                      <span className="line-clamp-2 font-medium leading-snug">
                        {item.product?.name ?? 'Item'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-sm tabular-nums">{item.quantity}</td>
                    <td className="px-2 py-2 text-right text-sm font-medium tabular-nums">
                      {formatCurrency(item.total_price)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span
                        className={cn(
                          'inline-block rounded px-1.5 py-0.5 text-[11px] font-medium capitalize sm:text-xs',
                          statusBadgeClass[item.status] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
