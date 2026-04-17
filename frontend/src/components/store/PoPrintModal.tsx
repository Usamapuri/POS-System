import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PurchaseOrderDetail } from '@/types'
import { printPurchaseOrder } from '@/lib/printPurchaseOrder'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: PurchaseOrderDetail | null
  businessName: string
  formatCurrency: (amount: number) => string
}

/** After creating a draft PO (or re-opening): optional thermal print, same flow as KOT print confirm. */
export function PoPrintModal({ open, onOpenChange, detail, businessName, formatCurrency }: Props) {
  if (!open || !detail) return null

  const lineCount = detail.lines?.length ?? 0

  const handlePrint = () => {
    printPurchaseOrder(detail, { businessName, formatCurrency })
    onOpenChange(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-lg max-w-md w-full p-6 space-y-5">
        <div>
          <h2 className="text-xl font-semibold">Print purchase order?</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Opens a receipt-style <strong>80mm</strong> slip for your thermal printer — handy for staff shopping lists
            or sending a paper copy to your vendor. You can cancel in the system print dialog if you change your mind.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Supplier:</span>{' '}
            <span className="font-medium">{detail.supplier_name}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Lines:</span>{' '}
            <span className="font-medium tabular-nums">{lineCount}</span>
          </p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Skip printing
          </Button>
          <Button type="button" className="w-full sm:w-auto gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4 shrink-0" aria-hidden />
            Print PO slip
          </Button>
        </div>
      </div>
    </div>
  )
}
