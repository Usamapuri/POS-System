import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Minus, Plus, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category, Product } from '@/types'

export interface UnsentCartItem {
  product: Product
  quantity: number
  special_instructions?: string
}

export interface UnsentItemsSectionProps {
  cart: UnsentCartItem[]
  categoryById: Map<string, Category>
  categoryColor: (cat: Category | undefined, fallback: string) => string
  formatCurrency: (n: number) => string
  /** When continuing an existing order, label becomes "Staging / New items" */
  continuing: boolean
  onIncrement: (product: Product) => void
  onDecrement: (productId: string) => void
  flashProductId: string | null
  cartRowRefs: React.MutableRefObject<Record<string, HTMLTableRowElement | null>>
  notes: string
  onNotesChange: (value: string) => void
  liveAnnouncementId: number
  liveAnnouncementText: string
}

export function UnsentItemsSection({
  cart,
  categoryById,
  categoryColor,
  formatCurrency,
  continuing,
  onIncrement,
  onDecrement,
  flashProductId,
  cartRowRefs,
  notes,
  onNotesChange,
  liveAnnouncementId,
  liveAnnouncementText,
}: UnsentItemsSectionProps) {
  return (
    <section aria-labelledby="unsent-items-heading">
      <span key={liveAnnouncementId} className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncementText}
      </span>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {continuing ? 'Staging (not sent)' : 'Current cart'}
          </div>
          <h3
            id="unsent-items-heading"
            className="flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            <ShoppingCart className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            {continuing ? 'New items' : 'Cart'} ({cart.length})
          </h3>
        </div>
      </div>
      {cart.length === 0 ? (
        <p className="mt-1 text-muted-foreground text-sm">Cart is empty</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[340px] table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: '38%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/70">
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Item
                </th>
                <th className="px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Rate
                </th>
                <th className="px-1 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Qty
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => {
                const lineTotal = item.product.price * item.quantity
                const showCartFlash = flashProductId === item.product.id
                const lineCat = item.product.category_id ? categoryById.get(item.product.category_id) : undefined
                const categoryAccent = categoryColor(lineCat, item.product.name)
                return (
                  <tr
                    key={item.product.id}
                    ref={(el) => {
                      cartRowRefs.current[item.product.id] = el
                    }}
                    className={cn(
                      'border-b border-border last:border-b-0 border-l-[3px] transition-[box-shadow,filter]',
                      'hover:brightness-[0.985] dark:hover:brightness-[1.04]',
                      showCartFlash &&
                        'ring-1 ring-inset ring-primary/30 animate-pulse [@media(prefers-reduced-motion:reduce)]:animate-none'
                    )}
                    style={{
                      borderLeftColor: categoryAccent,
                      backgroundColor: `color-mix(in srgb, ${categoryAccent} 13%, var(--card))`,
                    }}
                  >
                    <td className="min-w-0 px-3 py-2.5 align-middle">
                      <span className="line-clamp-2 font-medium leading-snug text-foreground">
                        {item.product.name}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 align-middle text-right text-sm tabular-nums text-muted-foreground">
                      {formatCurrency(item.product.price)}
                    </td>
                    <td className="px-1 py-2 align-middle">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 shrink-0 touch-manipulation"
                          onClick={() => onDecrement(item.product.id)}
                          aria-label={`Decrease ${item.product.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 shrink-0 touch-manipulation"
                          onClick={() => onIncrement(item.product)}
                          aria-label={`Increase ${item.product.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle text-right text-sm font-semibold tabular-nums">
                      {formatCurrency(lineTotal)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {cart.length > 0 && (
        <div className="mt-4">
          <Label className="text-sm">Notes</Label>
          <Input
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="mt-1"
            placeholder="Optional"
          />
        </div>
      )}
    </section>
  )
}
