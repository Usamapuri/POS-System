export interface AdjustmentTotals {
  subtotal: number
  /** Optional discount amount (compose mode typically 0). */
  discount?: number
  service: number
  tax: number
  taxRate: number
  total: number
}

export interface AdjustmentsSectionProps {
  totals: AdjustmentTotals
  formatCurrency: (n: number) => string
  /** Optional footer element (e.g., apply discount form). */
  children?: React.ReactNode
  /** Heading override; defaults to "Adjustments". */
  heading?: string
}

export function AdjustmentsSection({
  totals,
  formatCurrency,
  children,
  heading = 'Adjustments',
}: AdjustmentsSectionProps) {
  return (
    <section aria-labelledby="adjustments-heading" className="space-y-2">
      <h3
        id="adjustments-heading"
        className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {heading}
      </h3>
      <div className="space-y-1.5 rounded-lg border border-border bg-card/40 p-3 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium tabular-nums">{formatCurrency(totals.subtotal)}</span>
        </div>
        {typeof totals.discount === 'number' && totals.discount > 0 && (
          <div className="flex justify-between gap-4 text-primary">
            <span>Discount</span>
            <span className="font-medium tabular-nums">−{formatCurrency(totals.discount)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Service charge</span>
          <span className="font-medium tabular-nums">{formatCurrency(totals.service)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">
            Tax ({(totals.taxRate * 100).toFixed(0)}%)
          </span>
          <span className="font-medium tabular-nums">{formatCurrency(totals.tax)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base font-bold tracking-tight sm:text-lg">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(totals.total)}</span>
        </div>
      </div>
      {children && <div>{children}</div>}
    </section>
  )
}
