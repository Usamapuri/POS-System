import type { Order } from '@/types'
import { formatMoney } from '@/lib/currency'

export type CustomerReceiptSettings = {
  businessName: string
  address: string
  ntn: string
  posNumber: string
}

export function parseReceiptSettings(all: Record<string, unknown> | undefined): CustomerReceiptSettings {
  if (!all) {
    return { businessName: 'Restaurant', address: '', ntn: '', posNumber: '' }
  }
  const s = (k: string) => (typeof all[k] === 'string' ? (all[k] as string) : '')
  return {
    businessName: s('receipt_business_name') || 'Restaurant',
    address: s('receipt_address'),
    ntn: s('receipt_ntn'),
    posNumber: s('receipt_pos_number'),
  }
}

function paymentLabel(method: string): string {
  const m: Record<string, string> = {
    cash: 'Cash',
    credit_card: 'Credit Card',
    debit_card: 'Debit Card',
    digital_wallet: 'Digital Wallet',
    online: 'Online',
  }
  return m[method] ?? method
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function getCashierNameFromStorage(): string {
  try {
    const raw = localStorage.getItem('pos_user')
    if (!raw) return 'Staff'
    const u = JSON.parse(raw) as { username?: string; first_name?: string; last_name?: string }
    const n = `${u.first_name || ''} ${u.last_name || ''}`.trim()
    return n || u.username || 'Staff'
  } catch {
    return 'Staff'
  }
}

export function printCustomerReceipt(
  order: Order,
  cfg: CustomerReceiptSettings,
  opts: {
    cashierName: string
    paymentMethod: string
    paidAt: Date
    /** Defaults to PKR / RS via formatMoney when omitted. */
    formatAmount?: (n: number) => string
  }
): void {
  const fmt = opts.formatAmount ?? ((n: number) => formatMoney(n))
  const items = order.items ?? []
  const totalQty = items.filter((i) => i.status !== 'voided').reduce((s, i) => s + i.quantity, 0)
  const inv = order.order_number
  const tableNo = order.table?.table_number ?? '—'
  const dateStr = opts.paidAt.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })
  const timeStr = opts.paidAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const pay = paymentLabel(opts.paymentMethod)

  const rows = items
    .filter((i) => i.status !== 'voided')
    .map((i, idx) => {
      const name = (i.product?.name ?? 'Item').toUpperCase()
      const line = fmt(i.unit_price)
      const tot = fmt(i.total_price)
      return `<tr>
        <td>${idx + 1}</td>
        <td class="desc">${escapeHtml(name)}</td>
        <td class="num">${line}</td>
        <td class="num">${i.quantity}</td>
        <td class="num">${tot}</td>
      </tr>`
    })
    .join('')

  const addrLines = cfg.address
    .split('\n')
    .map((l) => escapeHtml(l.trim()))
    .filter(Boolean)
    .map((l) => `<div>${l}</div>`)
    .join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt ${escapeHtml(inv)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 10px; margin: 0; padding: 8px; color: #000; }
  .center { text-align: center; }
  .brand { font-size: 14px; font-weight: 700; letter-spacing: 0.02em; margin-bottom: 4px; }
  .meta { width: 100%; margin: 8px 0; border-collapse: collapse; }
  .meta td { padding: 2px 0; vertical-align: top; }
  .meta .lbl { width: 42%; }
  .meta .val { text-align: right; }
  table.items { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9px; }
  table.items th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 2px; text-align: left; }
  table.items th:nth-child(n+3), table.items td:nth-child(n+3) { text-align: right; }
  table.items td { padding: 3px 2px; vertical-align: top; }
  table.items td.desc { text-align: left; max-width: 42mm; word-break: break-word; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 8px; font-size: 10px; }
  .totals div { display: flex; justify-content: space-between; margin: 2px 0; }
  .totals .grand { font-weight: 700; border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; font-size: 11px; }
  hr.sep { border: none; border-top: 1px solid #000; margin: 8px 0; }
</style></head><body>
  <div class="center">
    <div class="brand">${escapeHtml(cfg.businessName)}</div>
    ${addrLines ? `<div style="font-size:9px;line-height:1.3">${addrLines}</div>` : ''}
  </div>
  ${cfg.ntn ? `<div style="font-size:9px;margin-top:6px">NTN / STRN: ${escapeHtml(cfg.ntn)}</div>` : ''}
  ${cfg.posNumber ? `<div style="font-size:9px">POS No: ${escapeHtml(cfg.posNumber)}</div>` : ''}
  <hr class="sep"/>
  <table class="meta">
    <tr><td class="lbl">Inv #</td><td class="val">${escapeHtml(inv)}</td></tr>
    <tr><td class="lbl">Cashier</td><td class="val">${escapeHtml(opts.cashierName)}</td></tr>
    <tr><td class="lbl">Date</td><td class="val">${escapeHtml(dateStr)}</td></tr>
    <tr><td class="lbl">Time</td><td class="val">${escapeHtml(timeStr)}</td></tr>
    <tr><td class="lbl">Table No.</td><td class="val">( ${escapeHtml(String(tableNo))} )</td></tr>
    <tr><td class="lbl">Mode of Payment</td><td class="val">${escapeHtml(pay)}</td></tr>
  </table>
  <table class="items">
    <thead><tr><th>#</th><th>Description</th><th>Price</th><th>QTY</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Total QTY</span><span>${totalQty}</span></div>
    <div><span>Subtotal</span><span>${fmt(order.subtotal)}</span></div>
    <div><span>Tax</span><span>${fmt(order.tax_amount)}</span></div>
    <div><span>Service</span><span>${fmt(order.service_charge_amount ?? 0)}</span></div>
    <div><span>Discount</span><span>-${fmt(order.discount_amount)}</span></div>
    <div class="grand"><span>Payable</span><span>${fmt(order.total_amount)}</span></div>
  </div>
</body></html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank', 'width=420,height=720,left=-2400,top=0,menubar=no,toolbar=no')
  if (!w) {
    URL.revokeObjectURL(url)
    return
  }
  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      w.focus()
      w.print()
    } finally {
      setTimeout(() => {
        try {
          w.close()
        } catch {
          /* ignore */
        }
        URL.revokeObjectURL(url)
      }, 800)
    }
  }
  w.onload = () => setTimeout(doPrint, 200)
  setTimeout(() => {
    if (!printed) doPrint()
  }, 1200)
}
