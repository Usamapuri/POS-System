import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LayoutDashboard } from 'lucide-react'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { OrderTypeMixSlice } from '@/types'
import { formatCount } from './dashboardFormat'
import { cn } from '@/lib/utils'

interface OrderTypeMixBarProps {
  data?: OrderTypeMixSlice[]
  isLoading: boolean
}

const TYPE_COLORS: Record<string, string> = {
  dine_in: 'bg-blue-500',
  takeout: 'bg-amber-500',
  takeaway: 'bg-amber-500',
  delivery: 'bg-violet-500',
  counter: 'bg-emerald-500',
  other: 'bg-slate-500',
}

function colorFor(type: string): string {
  return TYPE_COLORS[type] ?? 'bg-slate-400'
}

export function OrderTypeMixBar({ data, isLoading }: OrderTypeMixBarProps) {
  const { formatCurrency } = useCurrency()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutDashboard className="h-4 w-4 text-blue-600" />
          Order type mix
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-full" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No completed orders in this window.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {data.map((slice) => (
                <div
                  key={slice.order_type}
                  className={cn('h-full', colorFor(slice.order_type))}
                  style={{ width: `${slice.pct}%` }}
                  title={`${slice.label}: ${slice.pct.toFixed(1)}%`}
                />
              ))}
            </div>
            <ul className="space-y-2 text-sm">
              {data.map((slice) => (
                <li key={slice.order_type} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 truncate">
                    <span className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-sm', colorFor(slice.order_type))} />
                    <span className="truncate">{slice.label}</span>
                    <span className="text-xs text-muted-foreground">{formatCount(slice.count)} orders</span>
                  </span>
                  <span className="text-right tabular-nums">
                    <div className="text-sm font-medium">{formatCurrency(slice.amount)}</div>
                    <div className="text-[11px] text-muted-foreground">{slice.pct.toFixed(1)}%</div>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
