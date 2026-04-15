import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardList } from 'lucide-react'
import type { Order, OrderItem } from '@/types'

function needsPrep(item: OrderItem): boolean {
  if (item.status === 'voided' || item.status === 'draft') return false
  if (item.status === 'ready' || item.status === 'served') return false
  return true
}

export interface ConsolidatedPrepListProps {
  orders: (Order & { items?: OrderItem[] })[]
}

/**
 * Aggregates quantities across all active tickets for bulk prep (excludes voided & already prepared).
 */
export function ConsolidatedPrepList({ orders }: ConsolidatedPrepListProps) {
  const lines = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of orders) {
      for (const it of o.items ?? []) {
        if (!needsPrep(it)) continue
        const name = it.product?.name ?? 'Unknown'
        map.set(name, (map.get(name) ?? 0) + it.quantity)
      }
    }
    return [...map.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [orders])

  if (lines.length === 0) return null

  return (
    <Card className="border-2 border-slate-300 bg-slate-50/80 sticky bottom-0 z-10 shadow-lg">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Consolidated prep list
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex flex-wrap gap-2">
          {lines.map(({ name, qty }) => (
            <Badge
              key={name}
              variant="secondary"
              className="text-sm py-1.5 px-3 font-medium bg-white border border-slate-200"
            >
              <span className="font-bold text-slate-900">{qty}×</span>
              <span className="ml-1.5">{name}</span>
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
