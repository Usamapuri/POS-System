import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Printer, Monitor, Store } from 'lucide-react'
import type { StationKOT } from '@/types'
import { printKotReceipts } from '@/lib/printKotReceipt'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kots: StationKOT[] | undefined
}

/** After Fire KOT: confirm which thermal slips to print (kitchen station vs checkout counter). */
export function KotPrintModal({ open, onOpenChange, kots }: Props) {
  const list = kots ?? []
  const printerSlips = useMemo(() => list.filter((k) => k.output_type === 'printer'), [list])
  const hasKds = useMemo(() => list.some((k) => k.output_type === 'kds'), [list])

  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(() => new Set())

  useEffect(() => {
    if (!open) return
    setSelectedIdx(new Set(printerSlips.map((_, i) => i)))
  }, [open, printerSlips])

  if (!open) return null

  const toggle = (i: number) => {
    setSelectedIdx((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const selectAll = () => setSelectedIdx(new Set(printerSlips.map((_, i) => i)))
  const selectNone = () => setSelectedIdx(new Set())

  const handlePrint = () => {
    const toPrint = printerSlips.filter((_, i) => selectedIdx.has(i))
    printKotReceipts(toPrint)
    onOpenChange(false)
  }

  const kitchenIndices = printerSlips
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => (k.print_location ?? 'kitchen') === 'kitchen')
  const counterIndices = printerSlips
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => k.print_location === 'counter')

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Kitchen order tickets (KOT)</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Choose which thermal slips to print. Use <strong>Kitchen</strong> when a receipt printer is at that station;
            use <strong>Checkout counter</strong> when staff will walk the ticket to the kitchen.
          </p>
        </div>

        {hasKds && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/80 dark:bg-blue-950/40 dark:border-blue-900 px-3 py-2 text-sm flex gap-2 items-start">
            <Monitor className="h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
            <span>
              This order was also sent to the <strong>KDS</strong> for stations configured as kitchen displays.
            </span>
          </div>
        )}

        {printerSlips.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No thermal tickets for this fire (KDS-only routing). You can close this dialog.
          </p>
        ) : (
          <>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                Select all
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={selectNone}>
                Clear
              </Button>
            </div>

            {kitchenIndices.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Kitchen printers (at station)
                </div>
                <div className="space-y-2 rounded-md border border-border divide-y">
                  {kitchenIndices.map(({ k, i }) => (
                    <label
                      key={`k-${i}`}
                      className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedIdx.has(i)}
                        onCheckedChange={() => toggle(i)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{k.station_name}</div>
                        <div className="text-xs text-muted-foreground">Print on the thermal at this station</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {counterIndices.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Checkout counter (hand off to kitchen)
                </div>
                <div className="space-y-2 rounded-md border border-border divide-y">
                  {counterIndices.map(({ k, i }) => (
                    <label
                      key={`c-${i}`}
                      className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedIdx.has(i)}
                        onCheckedChange={() => toggle(i)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{k.station_name}</div>
                        <div className="text-xs text-muted-foreground">
                          Print here and carry to the kitchen (no station printer)
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Skip printing
          </Button>
          {printerSlips.length > 0 && (
            <Button type="button" onClick={handlePrint} disabled={selectedIdx.size === 0}>
              <Printer className="h-4 w-4 mr-2" />
              Print selected
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
