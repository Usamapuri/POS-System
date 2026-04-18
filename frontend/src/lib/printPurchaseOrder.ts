import type { PurchaseOrderDetail } from '@/types'
import { printThermalHtmlDocument } from '@/lib/printKotReceipt'
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '@/lib/utils'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function poRef(po: PurchaseOrderDetail): string {
  const compact = po.id.replace(/-/g, '')
  return compact.length >= 8 ? compact.slice(0, 8).toUpperCase() : po.id.slice(0, 12)
}

function statusLabel(status: string): string {
  const m: Record<string, string> = {
    draft: 'Draft',
    ordered: 'Ordered',
    partially_received: 'Partially received',
    received: 'Received',
    cancelled: 'Cancelled',
  }
  return m[status] ?? status.replace(/_/g, ' ')
}

export function buildPurchaseOrderPrintHtml(
  po: PurchaseOrderDetail,
  opts: { businessName: string; formatCurrency: (n: number) => string },
): string {
  const fmt = opts.formatCurrency
  const created = formatDateTimeDDMMYYYY(po.created_at)
  const expected =
    po.expected_date && po.expected_date.trim()
      ? formatDateDDMMYYYY(po.expected_date)
      : ''

  let grand = 0
  let anyCost = false
  const rows = po.lines.map((ln, idx) => {
    const name = (ln.item_name || 'Item').toUpperCase()
    const qtyStr = `${Number(ln.quantity_ordered)} ${ln.unit || ''}`.trim()
    const uc = ln.unit_cost
    const has = uc != null && Number.isFinite(Number(uc))
    if (has) {
      anyCost = true
      const lineTot = Number(ln.quantity_ordered) * Number(uc)
      grand += lineTot
    }
    const unitCell = has ? fmt(Number(uc)) : '—'
    const lineCell = has ? fmt(Number(ln.quantity_ordered) * Number(uc)) : '—'
    return `<tr>
      <td class="num">${idx + 1}</td>
      <td class="desc">${escapeHtml(name)}</td>
      <td class="num">${escapeHtml(qtyStr)}</td>
      <td class="num">${unitCell}</td>
      <td class="num">${lineCell}</td>
    </tr>`
  })

  const notesBlock =
    po.notes && po.notes.trim()
      ? `<div class="notes"><div class="lbl">Notes</div><div class="notes-body">${escapeHtml(po.notes.trim())}</div></div>`
      : ''

  const totalBlock = anyCost
    ? `<div class="totals"><div class="grand"><span>Est. total</span><span>${fmt(grand)}</span></div></div>`
    : ''

  const paperMm = 80

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>PO ${escapeHtml(poRef(po))}</title>
<style>
  @page { size: ${paperMm}mm auto; margin: 3mm 3mm 4mm; }
  html, body { width: ${paperMm}mm; max-width: ${paperMm}mm; }
  body {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 10px;
    margin: 0;
    padding: 0;
    color: #000;
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt { width: 100%; box-sizing: border-box; padding: 2mm 1.5mm; }
  .center { text-align: center; }
  .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; margin-bottom: 2px; }
  .doc-title { font-size: 12px; font-weight: 700; margin: 6px 0 2px; letter-spacing: 0.04em; }
  .status-pill { font-size: 9px; font-weight: 600; margin-bottom: 6px; }
  .meta { width: 100%; margin: 6px 0; border-collapse: collapse; font-size: 9px; }
  .meta td { padding: 2px 0; vertical-align: top; }
  .meta .lbl { width: 38%; }
  .meta .val { text-align: right; word-break: break-word; }
  .notes { margin: 8px 0; font-size: 9px; }
  .notes .lbl { font-weight: 700; margin-bottom: 2px; }
  .notes-body { white-space: pre-wrap; word-break: break-word; line-height: 1.35; }
  hr.sep { border: none; border-top: 1px solid #000; margin: 8px 0; }
  table.items { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 8px; }
  table.items th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 1px; text-align: left; }
  table.items th:nth-child(n+3), table.items td:nth-child(n+3) { text-align: right; }
  table.items th.desc, table.items td.desc { text-align: left; max-width: 28mm; word-break: break-word; }
  table.items td { padding: 3px 1px; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 8px; font-size: 10px; }
  .totals .grand { display: flex; justify-content: space-between; font-weight: 700; border-top: 1px dashed #000; padding-top: 6px; margin-top: 4px; }
  .footer { margin-top: 10px; font-size: 8px; text-align: center; color: #333; line-height: 1.4; }
</style></head><body>
  <div class="receipt">
    <div class="center">
      <div class="brand">${escapeHtml(opts.businessName)}</div>
    </div>
    <hr class="sep"/>
    <div class="center doc-title">PURCHASE ORDER</div>
    <div class="center status-pill">${escapeHtml(statusLabel(po.status))}</div>
    <table class="meta">
      <tr><td class="lbl">PO #</td><td class="val">${escapeHtml(poRef(po))}</td></tr>
      <tr><td class="lbl">Supplier</td><td class="val">${escapeHtml(po.supplier_name || '—')}</td></tr>
      <tr><td class="lbl">Created</td><td class="val">${escapeHtml(created)}</td></tr>
      ${expected ? `<tr><td class="lbl">Expected</td><td class="val">${escapeHtml(expected)}</td></tr>` : ''}
    </table>
    ${notesBlock}
    <hr class="sep"/>
    <table class="items">
      <thead><tr><th>#</th><th class="desc">Item</th><th>Qty</th><th>Unit</th><th>Line</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    ${totalBlock}
    <div class="footer">Shopping list / vendor copy — thermal PO slip</div>
  </div>
</body></html>`
}

export function printPurchaseOrder(
  po: PurchaseOrderDetail,
  opts: { businessName?: string; formatCurrency: (n: number) => string },
): void {
  const businessName = (opts.businessName && opts.businessName.trim()) || 'Restaurant'
  const html = buildPurchaseOrderPrintHtml(po, { businessName, formatCurrency: opts.formatCurrency })
  printThermalHtmlDocument(html)
}
