import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiningTable } from '@/types'

export type TablesPickerMode = 'select' | 'transfer'

export interface TablesPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: TablesPickerMode
  tables: DiningTable[]
  /** The table currently in context (to show as "Current" and hide as transfer destination). */
  currentTableId?: string | null
  onSelectFreeTable: (table: DiningTable) => void
  onSelectOccupiedTable: (table: DiningTable) => void
  /** In transfer mode, called when user confirms a destination. */
  onConfirmTransfer?: (table: DiningTable) => void
  isTransferring?: boolean
}

type TableStatus = 'free' | 'open'

function statusOf(table: DiningTable): TableStatus {
  const occ = table.has_active_order ?? table.is_occupied
  return occ ? 'open' : 'free'
}

export function TablesPicker({
  open,
  onOpenChange,
  mode,
  tables,
  currentTableId,
  onSelectFreeTable,
  onSelectOccupiedTable,
  onConfirmTransfer,
  isTransferring,
}: TablesPickerProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'free' | 'open'>('all')
  const [stagedTransferId, setStagedTransferId] = useState<string>('')

  const visibleTables = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tables
      .filter((t) => {
        if (mode === 'transfer' && currentTableId && t.id === currentTableId) return false
        if (mode === 'transfer' && statusOf(t) === 'open') return false
        if (filter === 'free' && statusOf(t) !== 'free') return false
        if (filter === 'open' && statusOf(t) !== 'open') return false
        if (!q) return true
        const hay = [t.table_number, t.location ?? '']
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) =>
        String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true })
      )
  }, [tables, filter, query, mode, currentTableId])

  const stats = useMemo(() => {
    let open = 0
    let free = 0
    for (const t of tables) {
      if (statusOf(t) === 'open') open += 1
      else free += 1
    }
    return { total: tables.length, open, free }
  }, [tables])

  const title = mode === 'transfer' ? 'Change table assignment' : 'Tables'
  const description =
    mode === 'transfer'
      ? 'Pick a free destination table to move the active order.'
      : 'Pick a table to start a new tab or continue an open one.'

  const handlePick = (table: DiningTable) => {
    if (mode === 'transfer') {
      setStagedTransferId(table.id)
      return
    }
    if (statusOf(table) === 'free') onSelectFreeTable(table)
    else onSelectOccupiedTable(table)
    onOpenChange(false)
  }

  const confirmTransfer = () => {
    const t = visibleTables.find((x) => x.id === stagedTransferId)
    if (!t || !onConfirmTransfer) return
    onConfirmTransfer(t)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2 text-xs text-muted-foreground">
          <div className="tabular-nums">
            <span className="font-semibold text-foreground">{stats.total}</span> tables ·{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">{stats.open}</span> open ·{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{stats.free}</span> free
          </div>
          {mode !== 'transfer' && (
            <div className="flex gap-1">
              {(['all', 'free', 'open'] as const).map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={filter === f ? 'default' : 'outline'}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'free' ? 'Free' : 'Open tabs'}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search table number or location…"
            className="pl-10 h-11"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-background">
          {visibleTables.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {mode === 'transfer'
                ? 'No free destination tables match your filter.'
                : 'No tables match your filter.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleTables.map((table) => {
                const s = statusOf(table)
                const isCurrent = table.id === currentTableId
                const isStaged = stagedTransferId === table.id
                return (
                  <button
                    key={table.id}
                    type="button"
                    className={cn(
                      'group relative flex min-h-[4.25rem] w-full flex-col items-start gap-0.5 rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-colors',
                      'hover:border-primary/40 hover:bg-muted/50',
                      s === 'open'
                        ? 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30'
                        : 'border-border',
                      isCurrent && 'ring-2 ring-primary/40',
                      isStaged && 'ring-2 ring-primary/70'
                    )}
                    onClick={() => handlePick(table)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-base font-semibold tracking-tight">
                        {table.table_number}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          s === 'open'
                            ? 'border-emerald-300 bg-white/80 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100'
                            : 'border-border bg-muted/60 text-muted-foreground'
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            s === 'open' ? 'bg-emerald-500' : 'bg-slate-400'
                          )}
                          aria-hidden
                        />
                        {s === 'open' ? 'Open' : 'Free'}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {table.seating_capacity} {table.seating_capacity === 1 ? 'seat' : 'seats'}
                      {table.location ? ` · ${table.location}` : ''}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Current
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {mode === 'transfer' && (
          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Transfer releases the source table automatically.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!stagedTransferId || isTransferring}
                onClick={confirmTransfer}
              >
                {isTransferring ? 'Moving…' : 'Confirm change'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
