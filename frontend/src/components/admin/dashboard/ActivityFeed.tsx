import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, AlertOctagon, CheckCircle2, CreditCard, ShoppingCart, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { DashboardActivityEntry, DashboardEventType } from '@/types'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ActivityFeedProps {
  entries: DashboardActivityEntry[]
}

const KIND_META: Record<
  DashboardEventType,
  { icon: LucideIcon; iconClass: string; label: string }
> = {
  order_created: { icon: ShoppingCart, iconClass: 'text-blue-600', label: 'Order' },
  order_updated: { icon: Activity, iconClass: 'text-slate-500', label: 'Updated' },
  order_completed: { icon: CheckCircle2, iconClass: 'text-emerald-600', label: 'Completed' },
  order_cancelled: { icon: X, iconClass: 'text-rose-600', label: 'Cancelled' },
  order_voided: { icon: AlertOctagon, iconClass: 'text-rose-600', label: 'Voided' },
  payment: { icon: CreditCard, iconClass: 'text-violet-600', label: 'Payment' },
  table_changed: { icon: Activity, iconClass: 'text-amber-600', label: 'Table' },
}

export function ActivityFeed({ entries }: ActivityFeedProps) {
  const { formatCurrency } = useCurrency()

  return (
    <Card className="flex h-full min-h-[420px] flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-emerald-600" />
            Activity feed
          </CardTitle>
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        {entries.length === 0 ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
            <Activity className="h-5 w-5 opacity-60" />
            Waiting for the next order, payment or void…
          </div>
        ) : (
          <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {entries.map((entry) => {
              const meta = KIND_META[entry.type] ?? KIND_META.order_updated
              const Icon = meta.icon
              return (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-2.5">
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.iconClass)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{entry.title}</span>
                      {entry.order_number && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                          #{entry.order_number}
                        </span>
                      )}
                    </div>
                    {entry.detail && (
                      <div className="truncate text-xs text-muted-foreground">{entry.detail}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {entry.amount != null && entry.amount !== 0 && (
                      <div className="text-sm font-semibold tabular-nums">
                        {formatCurrency(entry.amount)}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground">{formatTime(entry.at)}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
