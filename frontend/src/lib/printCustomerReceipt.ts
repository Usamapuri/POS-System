import type { Order } from '@/types'
import { formatMoney, formatMoneyPlain } from '@/lib/currency'
import { formatDateDDMMYYYY } from '@/lib/utils'

// ── Hardcoded attribution ─────────────────────────────────────────────
// Intentionally NOT configurable from the Settings UI. Only changeable here.
export const APP_ATTRIBUTION = 'software powered by artyreal.com 🚀'

// ── Types ─────────────────────────────────────────────────────────────

export type ReceiptCustomFieldPosition = 'header' | 'footer'
export type ReceiptCustomFieldStyle = 'normal' | 'bold' | 'muted'

export type ReceiptCustomField = {
  id: string
  label: string
  value: string
  position: ReceiptCustomFieldPosition
  style?: ReceiptCustomFieldStyle
}

export type CustomerReceiptSettings = {
  // Brand
  businessName: string
  logoUrl: string
  logoWidthPercent: number
  // Contact
  address: string
  phone: string
  email: string
  website: string
  // Legal / Tax
  ntn: string
  posNumber: string
  // Pricing (stored as fractions, e.g. 0.15 == 15%)
  taxRateCash: number
  taxRateCard: number
  taxRateOnline: number
  serviceChargeRate: number
  // Appearance
  accentColor: string
  thankYouMessage: string
  // Custom
  customFields: ReceiptCustomField[]
  // Paper
  paperWidthMm: number
  // PRA (Punjab Revenue Authority) tax invoice — optional second slip
  // printed only when the cashier confirms the customer requested it.
  praInvoiceEnabled: boolean
  /**
   * Template for the QR payload printed on the PRA slip. May contain the
   * placeholders `{invoice_number}` and `{order_number}`; unrecognised tokens
   * are left intact for future PRA API wiring.
   */
  praInvoiceQrUrlTemplate: string
  /** Optional small line rendered above the PRA logo block. */
  praInvoiceFooterNote: string
}

// ── Parsing ───────────────────────────────────────────────────────────

const DEFAULT_ACCENT = '#111827'
const DEFAULT_THANK_YOU = 'Thank you for your visit!'

function clampLogoWidth(v: number): number {
  if (!Number.isFinite(v)) return 75
  if (v < 70) return 70
  if (v > 80) return 80
  return Math.round(v)
}

function isSafeLogoUrl(raw: string): boolean {
  return /^(https?:\/\/|data:image\/)/i.test(raw)
}

function isValidHexColor(raw: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.trim())
}

function toNumber(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toString(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

function parseCustomFields(raw: unknown): ReceiptCustomField[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, idx): ReceiptCustomField | null => {
      if (!item || typeof item !== 'object') return null
      const r = item as Record<string, unknown>
      const label = toString(r.label)
      const value = toString(r.value)
      if (!label && !value) return null
      const position: ReceiptCustomFieldPosition = r.position === 'header' ? 'header' : 'footer'
      const style: ReceiptCustomFieldStyle =
        r.style === 'bold' || r.style === 'muted' ? r.style : 'normal'
      const id = toString(r.id) || `cf-${idx}`
      return { id, label, value, position, style }
    })
    .filter((v): v is ReceiptCustomField => v !== null)
}

export function parseReceiptSettings(
  all: Record<string, unknown> | undefined,
): CustomerReceiptSettings {
  const empty: CustomerReceiptSettings = {
    businessName: 'Restaurant',
    logoUrl: '',
    logoWidthPercent: 75,
    address: '',
    phone: '',
    email: '',
    website: '',
    ntn: '',
    posNumber: '',
    taxRateCash: 0,
    taxRateCard: 0,
    taxRateOnline: 0,
    serviceChargeRate: 0,
    accentColor: DEFAULT_ACCENT,
    thankYouMessage: DEFAULT_THANK_YOU,
    customFields: [],
    paperWidthMm: 80,
    praInvoiceEnabled: false,
    praInvoiceQrUrlTemplate: '',
    praInvoiceFooterNote: '',
  }

  if (!all) return empty

  const s = (k: string) => toString(all[k])
  const logoRaw = s('receipt_logo_url').trim()
  const accentRaw = s('receipt_accent_color').trim()
  const thankYouRaw = s('receipt_thank_you')

  return {
    businessName: s('receipt_business_name') || 'Restaurant',
    logoUrl: isSafeLogoUrl(logoRaw) ? logoRaw : '',
    logoWidthPercent: clampLogoWidth(toNumber(all['receipt_logo_width_percent'], 75)),
    address: s('receipt_address'),
    phone: s('receipt_phone'),
    email: s('receipt_email'),
    website: s('receipt_website'),
    ntn: s('receipt_ntn'),
    posNumber: s('receipt_pos_number'),
    taxRateCash: toNumber(all['tax_rate_cash'], 0),
    taxRateCard: toNumber(all['tax_rate_card'], 0),
    taxRateOnline: toNumber(all['tax_rate_online'], 0),
    serviceChargeRate: toNumber(all['service_charge_rate'], 0),
    accentColor: isValidHexColor(accentRaw) ? accentRaw : DEFAULT_ACCENT,
    thankYouMessage: thankYouRaw || DEFAULT_THANK_YOU,
    customFields: parseCustomFields(all['receipt_custom_fields']),
    paperWidthMm: 80,
    praInvoiceEnabled: all['pra_invoice_enabled'] === true,
    praInvoiceQrUrlTemplate: s('pra_invoice_qr_url_template'),
    praInvoiceFooterNote: s('pra_invoice_footer_note'),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function paymentLabel(method: string): string {
  const m: Record<string, string> = {
    cash: 'Cash',
    credit_card: 'Credit Card',
    debit_card: 'Debit Card',
    digital_wallet: 'Digital Wallet',
    online: 'Online',
    card: 'Card',
  }
  return m[method] ?? method
}

/**
 * Pick the tax rate that actually applied to this transaction, based on the
 * payment method used at checkout. Mirrors the pricing logic used elsewhere.
 */
export function pickTaxRate(cfg: CustomerReceiptSettings, paymentMethod: string): number {
  switch (paymentMethod) {
    case 'cash':
      return cfg.taxRateCash
    case 'online':
    case 'digital_wallet':
      return cfg.taxRateOnline
    case 'card':
    case 'credit_card':
    case 'debit_card':
      return cfg.taxRateCard
    default:
      return cfg.taxRateCash
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return ''
  // Round to 2 decimals; `String` strips trailing zeros naturally so
  // 0.15 → "15%", 0.075 → "7.5%", 0.1225 → "12.25%".
  const rounded = Math.round(fraction * 10000) / 100
  return `${rounded}%`
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

export function getServerNameFromOrder(order: Order): string {
  const u = order.user
  if (!u) return ''
  const full = `${u.first_name || ''} ${u.last_name || ''}`.trim()
  return full || u.username || ''
}

// ── Print ─────────────────────────────────────────────────────────────

export function printCustomerReceipt(
  order: Order,
  cfg: CustomerReceiptSettings,
  opts: {
    cashierName: string
    paymentMethod: string
    paidAt: Date
    /** Optional override; otherwise derived from order.user */
    serverName?: string
    /** Defaults to PKR / RS via formatMoney when omitted. Used for totals. */
    formatAmount?: (n: number) => string
    /**
     * Number-only formatter for the items table (no currency symbol). Keeps
     * locale grouping identical to `formatAmount`. Defaults to
     * `formatMoneyPlain` when omitted.
     */
    formatAmountPlain?: (n: number) => string
  },
): void {
  const html = buildReceiptHtml(order, cfg, {
    cashierName: opts.cashierName,
    paymentMethod: opts.paymentMethod,
    paidAt: opts.paidAt,
    serverName: opts.serverName ?? getServerNameFromOrder(order),
    formatAmount: opts.formatAmount,
    formatAmountPlain: opts.formatAmountPlain,
    forPrint: true,
  })

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

// ── HTML builder (shared with the in-app preview) ─────────────────────

export type BuildReceiptOptions = {
  cashierName: string
  paymentMethod: string
  paidAt: Date
  serverName?: string
  /** Currency-aware formatter used for totals (Subtotal, Tax, Payable, etc). */
  formatAmount?: (n: number) => string
  /**
   * Plain-number formatter used for the items table (no currency symbol).
   * Defaults to `formatMoneyPlain` so locale grouping stays consistent with
   * `formatAmount` / `formatMoney`.
   */
  formatAmountPlain?: (n: number) => string
  /** When true, emits a fully-styled document for window.print(); when false,
   *  emits a fragment suitable for embedding in the admin preview. */
  forPrint: boolean
  /**
   * When true, the closing block (custom footer lines, thank-you message,
   * and the "software powered by…" attribution) is omitted. Used by the
   * PRA tax invoice builder so it can slot its own block BEFORE the closing
   * block — ensuring the thank-you + attribution always come last on paper.
   * Callers that set this should render the closing block themselves via
   * `buildReceiptClosing()`.
   */
  omitClosing?: boolean
}

/**
 * Returns the closing HTML fragment rendered at the very bottom of every
 * printed receipt: optional footer custom fields, thank-you message, and the
 * hardcoded "software powered by artyreal.com" attribution. Exposed so that
 * receipt variants (e.g. the PRA tax invoice) can inject extra content above
 * it while keeping the final trailing lines consistent across all slips.
 *
 * Wrapped in a `.receipt`-styled container so CSS rules scoped under
 * `.receipt` (accent color, typography, paddings) still apply when this
 * fragment is rendered outside of the main receipt body.
 */
export function buildReceiptClosing(cfg: CustomerReceiptSettings): string {
  const footerCustom = cfg.customFields
    .filter((f) => f.position === 'footer')
    .map((field) => {
      const cls = `cf cf-${field.style ?? 'normal'}`
      if (field.label && field.value) {
        return `<div class="${cls}"><span class="cf-label">${escapeHtml(field.label)}</span><span class="cf-value">${escapeHtml(field.value)}</span></div>`
      }
      const content = field.label || field.value
      return `<div class="${cls} cf-solo">${escapeHtml(content)}</div>`
    })
    .join('')
  const thankYouMarkup = cfg.thankYouMessage
    ? `<div class="thankyou">${escapeHtml(cfg.thankYouMessage)}</div>`
    : ''
  const accent = cfg.accentColor || DEFAULT_ACCENT
  return `<div class="receipt rc-closing-wrap" style="--accent:${accent}">
    ${footerCustom ? `<div class="cf-block footer-cf">${footerCustom}</div>` : ''}
    ${thankYouMarkup}
    <footer class="rc-footer">
      <div class="attribution">${escapeHtml(APP_ATTRIBUTION)}</div>
    </footer>
  </div>`
}

export function buildReceiptHtml(
  order: Order,
  cfg: CustomerReceiptSettings,
  opts: BuildReceiptOptions,
): string {
  const fmt = opts.formatAmount ?? ((n: number) => formatMoney(n))
  // Bare-number formatter for the items table. Intentionally omits the
  // currency symbol — the currency is already implied by Subtotal / Payable
  // directly below the table, and repeating "Rs" on every row makes the
  // tight 80mm layout clunky.
  const fmtPlain = opts.formatAmountPlain ?? ((n: number) => formatMoneyPlain(n))
  const items = (order.items ?? []).filter((i) => i.status !== 'voided')
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const inv = order.order_number
  const dateStr = formatDateDDMMYYYY(opts.paidAt)
  const timeStr = opts.paidAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const pay = paymentLabel(opts.paymentMethod)

  const taxPct = formatPercent(pickTaxRate(cfg, opts.paymentMethod))
  const svcPct = formatPercent(cfg.serviceChargeRate)

  // Items rows
  const rows = items
    .map((i, idx) => {
      const name = (i.product?.name ?? 'Item').toUpperCase()
      const note = (i.special_instructions || i.notes || '').trim()
      const noteLine = note
        ? `<tr class="note-row"><td></td><td colspan="4" class="note">↳ ${escapeHtml(note)}</td></tr>`
        : ''
      return `<tr class="item-row">
        <td class="num-col">${idx + 1}</td>
        <td class="desc">${escapeHtml(name)}</td>
        <td class="num">${fmtPlain(i.unit_price)}</td>
        <td class="num qty">${i.quantity}</td>
        <td class="num">${fmtPlain(i.total_price)}</td>
      </tr>${noteLine}`
    })
    .join('')

  // Header contact block (each line only if present)
  const addrLines = cfg.address
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join('')

  const contactLines: string[] = []
  if (cfg.phone) contactLines.push(`<div>📞 ${escapeHtml(cfg.phone)}</div>`)
  if (cfg.email) contactLines.push(`<div>✉ ${escapeHtml(cfg.email)}</div>`)
  if (cfg.website) contactLines.push(`<div>🌐 ${escapeHtml(cfg.website)}</div>`)
  const contactMarkup = contactLines.length
    ? `<div class="contact">${contactLines.join('')}</div>`
    : ''

  const legalLines: string[] = []
  if (cfg.ntn) legalLines.push(`NTN / STRN: ${escapeHtml(cfg.ntn)}`)
  if (cfg.posNumber) legalLines.push(`POS # ${escapeHtml(cfg.posNumber)}`)
  const legalMarkup = legalLines.length
    ? `<div class="legal">${legalLines.map((l) => `<div>${l}</div>`).join('')}</div>`
    : ''

  const logoMarkup = cfg.logoUrl
    ? `<div class="logo-wrap"><img src="${escapeHtml(cfg.logoUrl)}" alt="Business logo" class="logo"/></div>`
    : ''

  // Custom fields
  const renderCustom = (field: ReceiptCustomField) => {
    const cls = `cf cf-${field.style ?? 'normal'}`
    if (field.label && field.value) {
      return `<div class="${cls}"><span class="cf-label">${escapeHtml(field.label)}</span><span class="cf-value">${escapeHtml(field.value)}</span></div>`
    }
    const content = field.label || field.value
    return `<div class="${cls} cf-solo">${escapeHtml(content)}</div>`
  }
  const headerCustom = cfg.customFields.filter((f) => f.position === 'header').map(renderCustom).join('')
  const footerCustom = cfg.customFields.filter((f) => f.position === 'footer').map(renderCustom).join('')

  // Meta rows — skip server line entirely when unassigned
  const metaRows: string[] = []
  metaRows.push(`<tr><td class="lbl">Invoice #</td><td class="val">${escapeHtml(inv)}</td></tr>`)
  metaRows.push(`<tr><td class="lbl">Cashier</td><td class="val">${escapeHtml(opts.cashierName)}</td></tr>`)
  metaRows.push(`<tr><td class="lbl">Date</td><td class="val">${escapeHtml(dateStr)}</td></tr>`)
  metaRows.push(`<tr><td class="lbl">Time</td><td class="val">${escapeHtml(timeStr)}</td></tr>`)
  if (opts.serverName) {
    metaRows.push(`<tr><td class="lbl">Server</td><td class="val">${escapeHtml(opts.serverName)}</td></tr>`)
  }
  if (order.table?.table_number != null) {
    metaRows.push(`<tr><td class="lbl">Table</td><td class="val">${escapeHtml(String(order.table.table_number))}</td></tr>`)
  }
  metaRows.push(`<tr><td class="lbl">Payment</td><td class="val">${escapeHtml(pay)}</td></tr>`)

  // Totals rows — only render ones with meaningful values
  const discount = order.discount_amount ?? 0
  const service = order.service_charge_amount ?? 0
  const totalsRows: string[] = []
  totalsRows.push(`<div class="tr"><span>Total Qty</span><span>${totalQty}</span></div>`)
  totalsRows.push(`<div class="tr"><span>Subtotal</span><span>${fmt(order.subtotal)}</span></div>`)
  totalsRows.push(
    `<div class="tr"><span>Sales Tax${taxPct ? ` (${taxPct})` : ''}</span><span>${fmt(order.tax_amount)}</span></div>`,
  )
  if (service > 0 || svcPct) {
    totalsRows.push(
      `<div class="tr"><span>Service Charges${svcPct ? ` (${svcPct})` : ''}</span><span>${fmt(service)}</span></div>`,
    )
  }
  if (discount > 0) {
    // Only show the "(X%)" suffix when the discount was actually entered as a
    // percentage — for flat-amount discounts the label stays plain "Discount".
    const pct = order.discount_percent
    const pctLabel = typeof pct === 'number' && pct > 0 ? ` (${formatPercent(pct / 100)})` : ''
    totalsRows.push(
      `<div class="tr"><span>Discount${pctLabel}</span><span>−${fmt(discount)}</span></div>`,
    )
  }
  const delFee = order.delivery_fee_amount ?? 0
  if (delFee > 0) {
    totalsRows.push(`<div class="tr"><span>Delivery fee</span><span>${fmt(delFee)}</span></div>`)
  }

  const thankYouMarkup = cfg.thankYouMessage
    ? `<div class="thankyou">${escapeHtml(cfg.thankYouMessage)}</div>`
    : ''

  const accent = cfg.accentColor || DEFAULT_ACCENT
  const paper = cfg.paperWidthMm

  // Body fragment — same structure whether printed or previewed
  const body = `
  <div class="receipt" style="--accent:${accent}">
    <header class="rc-header">
      ${logoMarkup}
      <div class="brand">${escapeHtml(cfg.businessName)}</div>
      ${addrLines ? `<div class="addr">${addrLines}</div>` : ''}
      ${contactMarkup}
      ${legalMarkup}
      ${headerCustom ? `<div class="cf-block">${headerCustom}</div>` : ''}
    </header>

    <div class="section-label">Order Details</div>
    <table class="meta">${metaRows.join('')}</table>

    <div class="section-label">Items</div>
    <table class="items">
      <thead>
        <tr>
          <th class="num-col">#</th>
          <th>Description</th>
          <th class="num">Price</th>
          <th class="num qty">Qty</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="section-label">Payment Summary</div>
    <div class="totals">
      ${totalsRows.join('')}
      <div class="tr grand"><span>Payable</span><span>${fmt(order.total_amount)}</span></div>
    </div>

    ${opts.omitClosing ? '' : `${footerCustom ? `<div class="cf-block footer-cf">${footerCustom}</div>` : ''}
    ${thankYouMarkup}

    <footer class="rc-footer">
      <div class="attribution">${escapeHtml(APP_ATTRIBUTION)}</div>
    </footer>`}
  </div>`

  const styles = receiptStylesheet(paper)

  if (!opts.forPrint) {
    // Return a self-contained fragment with scoped styles for the admin preview.
    return `<style>${styles}</style>${body}`
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt ${escapeHtml(inv)}</title>
<style>
  @page { size: ${paper}mm auto; margin: 3mm 3mm 4mm; }
  html, body { width: ${paper}mm; max-width: ${paper}mm; margin: 0; padding: 0; background: #fff; }
  ${styles}
</style></head><body>${body}</body></html>`
}

function receiptStylesheet(paperMm: number): string {
  // Hybrid typography: sans-serif for brand/header/section labels/custom lines;
  // monospace for items table and totals for thermal-safe column alignment.
  return `
  .receipt {
    --accent: ${'#111827'};
    width: ${paperMm}mm;
    max-width: ${paperMm}mm;
    box-sizing: border-box;
    padding: 2mm 1.5mm;
    color: #000;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 10px;
    line-height: 1.35;
  }
  .receipt * { box-sizing: border-box; }

  .rc-header { text-align: center; }
  .logo-wrap { margin: 0 0 4px; }
  .logo { display: block; margin: 0 auto; width: 75%; max-width: 100%; max-height: 22mm; object-fit: contain; object-position: center; }
  .brand {
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 15px; font-weight: 700; letter-spacing: 0.01em; margin: 2px 0 3px;
    color: var(--accent);
  }
  .addr, .contact, .legal {
    font-family: 'Inter', system-ui, -apple-system, Helvetica, Arial, sans-serif;
    font-size: 9.5px; line-height: 1.35;
  }
  .contact { margin-top: 3px; }
  .contact div, .legal div { margin: 1px 0; }
  .legal { margin-top: 3px; font-weight: 600; }

  .section-label {
    font-family: 'Inter', system-ui, Helvetica, Arial, sans-serif;
    font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--accent); opacity: 0.85;
    margin: 10px 0 4px;
    border-top: 1px dashed #000; padding-top: 6px;
  }

  table.meta { width: 100%; border-collapse: collapse; margin: 0; }
  table.meta td { padding: 2px 0; vertical-align: top; font-size: 10px; }
  table.meta .lbl {
    font-family: 'Inter', system-ui, Helvetica, Arial, sans-serif;
    width: 45%; color: #333;
  }
  table.meta .val { text-align: right; font-weight: 600; }

  table.items { width: 100%; border-collapse: collapse; margin: 2px 0 0; font-size: 9.5px; }
  table.items thead th {
    font-family: 'Inter', system-ui, Helvetica, Arial, sans-serif;
    font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.08em;
    border-top: 1.5px solid var(--accent);
    border-bottom: 1.5px solid var(--accent);
    padding: 4px 2px;
    text-align: left;
    background: transparent;
  }
  table.items th.num, table.items td.num { text-align: right; white-space: nowrap; }
  table.items th.num-col, table.items td.num-col { width: 6mm; text-align: left; color: #555; }
  table.items th.qty, table.items td.qty { width: 8mm; text-align: right; }
  table.items td { padding: 3px 2px; vertical-align: top; }
  table.items td.desc { text-align: left; max-width: 40mm; word-break: break-word; font-weight: 600; }
  table.items tr.item-row td { border-bottom: 1px dotted #cbd5e1; }
  table.items tr.item-row:last-child td { border-bottom: none; }
  table.items tr.note-row td.note {
    font-family: 'Inter', system-ui, Helvetica, Arial, sans-serif;
    font-size: 8.5px; font-style: italic; color: #555;
    padding: 0 2px 4px; border-bottom: 1px dotted #cbd5e1;
  }

  .totals { margin-top: 2px; font-size: 10px; }
  .totals .tr { display: flex; justify-content: space-between; margin: 2px 0; }
  .totals .tr span:last-child { font-variant-numeric: tabular-nums; }
  .totals .grand {
    font-family: 'Inter', system-ui, Helvetica, Arial, sans-serif;
    font-weight: 800; font-size: 12.5px;
    border-top: 2px solid var(--accent); padding-top: 6px; margin-top: 6px;
    color: var(--accent);
  }

  .cf-block { margin-top: 8px; border-top: 1px dashed #000; padding-top: 6px; }
  .cf-block.footer-cf { margin-top: 10px; }
  .cf {
    font-family: 'Inter', system-ui, Helvetica, Arial, sans-serif;
    font-size: 9.5px; display: flex; gap: 6px; margin: 2px 0; justify-content: space-between;
  }
  .cf.cf-solo { justify-content: center; text-align: center; }
  .cf .cf-label { font-weight: 600; }
  .cf.cf-bold { font-weight: 700; }
  .cf.cf-muted { color: #555; }

  .thankyou {
    font-family: 'Inter', system-ui, Helvetica, Arial, sans-serif;
    text-align: center; font-size: 10.5px; font-weight: 600;
    margin: 10px 0 4px; color: var(--accent);
  }

  .rc-footer {
    margin-top: 8px;
    border-top: 1px dashed #000;
    padding-top: 6px;
    text-align: center;
  }
  .attribution {
    font-family: 'Inter', system-ui, Helvetica, Arial, sans-serif;
    font-size: 8px; color: #666; letter-spacing: 0.02em;
  }
  `
}
