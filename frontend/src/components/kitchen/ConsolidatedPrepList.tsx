import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { displayTicketNo } from './KOTCard'
import type { Order, OrderItem } from '@/types'

function needsPrep(item: OrderItem): boolean {
  if (item.status === 'voided' || item.status === 'draft') return false
  if (item.status === 'ready' || item.status === 'served') return false
  return true
}

export interface ConsolidatedPrepListProps {
  orders: (Order & { items?: OrderItem[] })[]
  /** Dense vertical rail variant (default). Pass false to use the compact footer variant. */
  rail?: boolean
}

interface LineContribution {
  ticketNo: string
  qty: number
}

interface PrepLine {
  name: string
  qty: number
  contributions: LineContribution[]
}

/**
 * Aggregates quantities across all active tickets for bulk prep. Lines that
 * are prepared/voided/draft are excluded because the cook doesn't need to
 * touch them again. Each line can be expanded to show which tickets are
 * feeding into its total so the cook can batch intelligently.
 */
export function ConsolidatedPrepList({ orders, rail = true }: ConsolidatedPrepListProps) {
  const lines = useMemo<PrepLine[]>(() => {
    const map = new Map<string, PrepLine>()
    for (const o of orders) {
      const ticketNo = displayTicketNo(o.order_number)
      for (const it of o.items ?? []) {
        if (!needsPrep(it)) continue
        const name = it.product?.name ?? 'Unknown'
        const cur = map.get(name)
        if (cur) {
          cur.qty += it.quantity
          const existing = cur.contributions.find((c) => c.ticketNo === ticketNo)
          if (existing) existing.qty += it.quantity
          else cur.contributions.push({ ticketNo, qty: it.quantity })
        } else {
          map.set(name, { name, qty: it.quantity, contributions: [{ ticketNo, qty: it.quantity }] })
        }
      }
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
  }, [orders])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const totalQty = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines])

  if (rail) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">Prep queue</span>
          </div>
          {lines.length > 0 && (
            <Badge variant="outline" className="font-mono text-[11px]">
              {totalQty} item{totalQty !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4">
              <p className="text-xs text-center text-muted-foreground leading-relaxed">
                Nothing to prep.
                <br />
                New tickets will aggregate here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-gray-700">
              {lines.map((line) => {
                const isOpen = expanded.has(line.name)
                return (
                  <li key={line.name}>
                    <Button
                      variant="ghost"
                      onClick={() => toggle(line.name)}
                      className={cn(
                        'w-full justify-between h-auto py-2.5 px-4 rounded-none text-left',
                        isOpen && 'bg-slate-50 dark:bg-gray-800',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center justify-center min-w-[2rem] h-6 px-1.5 rounded-md bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold tabular-nums">
                          {line.qty}
                        </span>
                        <span className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">
                          {line.name}
                        </span>
                      </div>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </Button>
                    {isOpen && (
                      <div className="px-4 pb-2.5 pt-0.5">
                        <div className="flex flex-wrap gap-1">
                          {line.contributions.map((c) => (
                            <Badge
                              key={c.ticketNo}
                              variant="outline"
                              className="text-[10px] font-mono"
                            >
                              {c.ticketNo} · {c.qty}×
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // Compact footer variant (legacy callers).
  if (lines.length === 0) return null
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
        <ClipboardList className="h-3.5 w-3.5" />
        Prep:
      </span>
      <div className="flex gap-1.5">
        {lines.map((line) => (
          <Badge key={line.name} variant="secondary" className="text-xs font-medium bg-white border border-slate-200">
            <span className="font-bold text-slate-900">{line.qty}×</span>
            <span className="ml-1">{line.name}</span>
          </Badge>
        ))}
      </div>
    </div>
  )
}
