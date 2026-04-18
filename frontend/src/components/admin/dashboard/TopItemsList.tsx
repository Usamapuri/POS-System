import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, Trophy } from 'lucide-react'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { DashboardTopItem } from '@/types'
import { formatCount } from './dashboardFormat'

interface TopItemsListProps {
  items?: DashboardTopItem[]
  isLoading: boolean
}

export function TopItemsList({ items, isLoading }: TopItemsListProps) {
  const { formatCurrency } = useCurrency()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-amber-600" />
            Top sellers
          </CardTitle>
          <span className="text-xs text-muted-foreground">By revenue</span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            <Sparkles className="h-5 w-5" />
            No items sold in this window yet.
          </div>
        ) : (
          <ol className="space-y-2.5">
            {items.map((item, idx) => (
              <li key={item.product_id || `${item.name}-${idx}`} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.category ?? 'Uncategorized'} · {formatCount(item.qty_sold)} sold
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{formatCurrency(item.revenue)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {item.percent_of_net.toFixed(1)}% of net
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
